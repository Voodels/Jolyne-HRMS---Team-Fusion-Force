package com.example.demo.service.impl;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.example.demo.dto.CandidateRequestDto;
import com.example.demo.dto.CandidateResponseDto;
import com.example.demo.entity.Candidate;
import com.example.demo.enums.PipelineStage;
import com.example.demo.repository.CandidateRepository;
import com.example.demo.service.CandidateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class CandidateServiceImpl implements CandidateService {

    private static final Logger logger = LoggerFactory.getLogger(CandidateServiceImpl.class);

    private final CandidateRepository candidateRepository;
    private final Cloudinary cloudinary;
    private final ObjectMapper objectMapper;

    @Value("${AFFINDA_API_KEY:}")
    private String affindaApiKey;

    @Value("${SQL_AGENT_BASE_URL:http://localhost:8000}")
    private String sqlAgentBaseUrl;

    private final RestTemplate restTemplate = new RestTemplate();
    private static final String AFFINDA_API_URL = "https://api.affinda.com/v2/resumes";

    // =========================
    // FILE UPLOAD
    // =========================
    @Override
    public String uploadResume(MultipartFile file) {
        try {
            Map uploadResult = cloudinary.uploader().upload(
                    file.getBytes(),
                    ObjectUtils.asMap("resource_type", "raw")
            );
            return uploadResult.get("secure_url").toString();
        } catch (IOException e) {
            throw new RuntimeException("Failed to upload file");
        }
    }

    // =========================
    // PARSE RESUME VIA AFFINDA
    // =========================
    @Override
    public String parseResumeWithAffinda(MultipartFile file) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(affindaApiKey);
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            org.springframework.util.MultiValueMap<String, Object> body = new org.springframework.util.LinkedMultiValueMap<>();
            body.add("file", new org.springframework.core.io.ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return file.getOriginalFilename();
                }
            });

            HttpEntity<org.springframework.util.MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    AFFINDA_API_URL,
                    HttpMethod.POST,
                    requestEntity,
                    String.class
            );

            return response.getBody();
        } catch (IOException e) {
            throw new RuntimeException("Failed to read file for Affinda parsing", e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse resume with Affinda: " + e.getMessage(), e);
        }
    }

    // =========================
    // CREATE (NORMAL)
    // =========================
    @Override
    public CandidateResponseDto createCandidate(CandidateRequestDto dto) {
        Candidate candidate = mapToEntity(dto);
        CandidateResponseDto response = convertToResponseDto(candidateRepository.save(candidate));
        notifyRagUpsert(response.getId());
        return response;
    }

    // =========================
    // CREATE FROM FULL JSON 🔥
    // =========================

    @Override
    public CandidateResponseDto createFromResumeJson(String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            CandidateRequestDto dto = mapJsonNodeToRequestDto(root);
            return createCandidate(dto);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse resume JSON: " + e.getMessage(), e);
        }
    }

    // =========================
    // UPDATE (NORMAL)
    // =========================
    @Override
    public CandidateResponseDto updateCandidate(Long id, CandidateRequestDto dto) {
        Candidate candidate = getCandidate(id);
        mapToExistingEntity(dto, candidate);
        CandidateResponseDto response = convertToResponseDto(candidateRepository.save(candidate));
        notifyRagUpsert(response.getId());
        return response;
    }

    // =========================
    // UPDATE FULL JSON
    // =========================
    @Override
    public CandidateResponseDto updateFromResumeJson(Long id, String json) {
        try {
            CandidateRequestDto dto = mapJsonNodeToRequestDto(objectMapper.readTree(json));
            return updateCandidate(id, dto);
        } catch (Exception e) {
            throw new RuntimeException("Failed to update resume JSON", e);
        }
    }

    // =========================
    // GET
    // =========================
    @Override
    public CandidateResponseDto getCandidateById(Long id) {
        return convertToResponseDto(getCandidate(id));
    }

    @Override
    public Page<CandidateResponseDto> getAllCandidates(Pageable pageable) {
        return candidateRepository.findAll(pageable).map(this::convertToResponseDto);
    }

    // =========================
    // DELETE
    // =========================
    @Override
    public void deleteCandidate(Long id) {
        if (!candidateRepository.existsById(id)) {
            throw new EntityNotFoundException("Candidate not found");
        }
        candidateRepository.deleteById(id);
        notifyRagDelete(id);
    }

    // =========================
    // PIPELINE
    // =========================
    @Override
    public CandidateResponseDto updatePipelineStage(Long id, String stage) {
        Candidate candidate = getCandidate(id);
        candidate.updateStage(PipelineStage.valueOf(stage.toUpperCase()));
        CandidateResponseDto response = convertToResponseDto(candidateRepository.save(candidate));
        notifyRagUpsert(response.getId());
        return response;
    }

    // =========================
    // SEARCH
    // =========================
    @Override
    public List<CandidateResponseDto> searchCandidatesByName(String name) {
        return candidateRepository.searchByName(name)
                .stream()
                .map(this::convertToResponseDto)
                .collect(Collectors.toList());
    }

    @Override
    public Page<CandidateResponseDto> searchCandidatesBySkill(String skill, Pageable pageable) {
        return candidateRepository.findBySkillsContainingIgnoreCase(skill, pageable)
                .map(this::convertToResponseDto);
    }

    // =========================
    // FILTER 🔥
    // =========================
    @Override
    public Page<CandidateResponseDto> filterCandidates(
            String name,
            String skill,
            String company,
            String domain,
            Double minExp,
            Double maxExp,
            Pageable pageable) {

        return candidateRepository.findAll(pageable)
                .map(this::convertToResponseDto)
                .map(dto -> dto) // placeholder (replace with spec later)
                ;
    }

    // =========================
    // GET RAW JSON
    // =========================
    @Override
    public String getResumeJson(Long id) {
        Candidate c = getCandidate(id);
        return c.getExperienceDetails(); // or combine multiple fields
    }

    // =========================
    // HELPER METHODS
    // =========================

    private Candidate getCandidate(Long id) {
        return candidateRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Candidate not found with id: " + id));
    }

    private void notifyRagDelete(Long candidateId) {
        if (sqlAgentBaseUrl == null || sqlAgentBaseUrl.isBlank()) {
            logger.warn("SQL_AGENT_BASE_URL not configured; skipping RAG delete sync for id={}", candidateId);
            return;
        }

        String url = sqlAgentBaseUrl + "/rag/delete";
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> payload = Map.of("candidate_id", String.valueOf(candidateId));
            HttpEntity<Map<String, String>> requestEntity = new HttpEntity<>(payload, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, requestEntity, String.class);
            logger.info("RAG delete sync status={} candidateId={}", response.getStatusCode(), candidateId);
        } catch (Exception e) {
            logger.warn("RAG delete sync failed for candidateId={}: {}", candidateId, e.getMessage());
        }
    }

    private void notifyRagUpsert(Long candidateId) {
        if (sqlAgentBaseUrl == null || sqlAgentBaseUrl.isBlank()) {
            logger.warn("SQL_AGENT_BASE_URL not configured; skipping RAG upsert sync for id={}", candidateId);
            return;
        }

        String url = sqlAgentBaseUrl + "/rag/upsert";
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> payload = Map.of("candidate_id", String.valueOf(candidateId));
            HttpEntity<Map<String, String>> requestEntity = new HttpEntity<>(payload, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, requestEntity, String.class);
            logger.info("RAG upsert sync status={} candidateId={}", response.getStatusCode(), candidateId);
        } catch (Exception e) {
            logger.warn("RAG upsert sync failed for candidateId={}: {}", candidateId, e.getMessage());
        }
    }

    private Candidate mapToEntity(CandidateRequestDto dto) {
        Candidate c = new Candidate();

        mapToExistingEntity(dto, c);
        c.setCurrentStage(dto.getCurrentStage() != null ? dto.getCurrentStage() : PipelineStage.APPLIED);

        return c;
    }

    private void mapToExistingEntity(CandidateRequestDto dto, Candidate c) {
        String resolvedFullName = resolveFullName(dto);
        String[] nameParts = splitName(resolvedFullName);
        String firstName = firstNonBlank(dto.getFirstName(), nameParts[0], "Unknown");
        String lastName = firstNonBlank(dto.getLastName(), nameParts[1], "Unknown");

        c.setFullName(firstNonBlank(resolvedFullName, (firstName + " " + lastName).trim(), "Unknown Unknown"));
        c.setFirstName(firstName);
        c.setMiddleName(dto.getMiddleName());
        c.setLastName(lastName);

        c.setEmail(firstNonBlank(dto.getEmail(), c.getEmail(), System.currentTimeMillis() + "@temp.com"));
        c.setPhone(dto.getPhone());
        c.setAlternatePhone(dto.getAlternatePhone());

        c.setDateOfBirth(parseLocalDate(dto.getDateOfBirth()));
        c.setGender(dto.getGender());
        c.setAddressFull(dto.getAddressFull());
        c.setLocation(dto.getLocation());
        c.setCity(dto.getCity());
        c.setState(dto.getState());
        c.setCountry(dto.getCountry());
        c.setPincode(dto.getPincode());

        c.setLinkedinUrl(dto.getLinkedinUrl());
        c.setGithubUrl(dto.getGithubUrl());
        c.setPortfolioUrl(dto.getPortfolioUrl());
        c.setWebsiteUrl(dto.getWebsiteUrl());
        c.setOtherLinks(toJson(dto.getOtherLinks()));

        c.setSummaryText(dto.getSummaryText());
        c.setCareerObjective(dto.getCareerObjective());

        c.setYearsOfExperience(dto.getYearsOfExperience());
        c.setTotalExperienceYears(dto.getTotalExperienceYears());

        c.setCurrentJobTitle(dto.getCurrentJobTitle());
        c.setDepartment(dto.getDepartment());
        c.setHighestEducation(dto.getHighestEducation());
        c.setPrimarySkill(dto.getPrimarySkill());
        c.setDomain(dto.getDomain());

        c.setSkills(dto.getSkills());
        c.setSkillsDetailed(toJson(dto.getSkillsDetailed()));

        c.setCurrentCompany(dto.getCurrentCompany());
        c.setCurrentCtc(dto.getCurrentCtc());

        c.setEducation(dto.getEducation());
        c.setEducationDetails(toJson(dto.getEducationDetails()));

        c.setExperienceDetails(toJson(dto.getExperienceDetails()));
        c.setProjects(toJson(dto.getProjects()));
        c.setAchievements(toJson(dto.getAchievements()));
        c.setCertifications(toJson(dto.getCertifications()));
        c.setPositions(toJson(dto.getPositions()));
        c.setCodingProfiles(toJson(dto.getCodingProfiles()));
        c.setLanguages(toJson(dto.getLanguages()));
        c.setPublications(toJson(dto.getPublications()));
        c.setActivities(toJson(dto.getActivities()));
        c.setSectionName(toJson(dto.getSectionName()));
        c.setSectionData(toJson(dto.getSectionData()));

        c.setResumeUrl(dto.getResumeUrl());
        c.setResumeText(dto.getResumeText());
        c.setStageHistory(toJson(dto.getStageHistory()));

        if (dto.getCurrentStage() != null) {
            c.setCurrentStage(dto.getCurrentStage());
        }
    }

    private CandidateResponseDto convertToResponseDto(Candidate c) {

        CandidateResponseDto dto = new CandidateResponseDto();

        dto.setId(c.getId());
        dto.setFullName(c.getFullName());
        dto.setFirstName(c.getFirstName());
        dto.setMiddleName(c.getMiddleName());
        dto.setLastName(c.getLastName());

        dto.setEmail(c.getEmail());
        dto.setPhone(c.getPhone());
        dto.setAlternatePhone(c.getAlternatePhone());
        dto.setDateOfBirth(c.getDateOfBirth());
        dto.setGender(c.getGender());

        dto.setLocation(c.getLocation());
        dto.setAddressFull(c.getAddressFull());
        dto.setCity(c.getCity());
        dto.setState(c.getState());
        dto.setCountry(c.getCountry());
        dto.setPincode(c.getPincode());

        dto.setLinkedinUrl(c.getLinkedinUrl());
        dto.setGithubUrl(c.getGithubUrl());
        dto.setPortfolioUrl(c.getPortfolioUrl());
        dto.setWebsiteUrl(c.getWebsiteUrl());
        dto.setOtherLinks(c.getOtherLinks());

        dto.setSummaryText(c.getSummaryText());
        dto.setCareerObjective(c.getCareerObjective());

        dto.setYearsOfExperience(c.getYearsOfExperience());
        dto.setTotalExperienceYears(c.getTotalExperienceYears());

        dto.setCurrentJobTitle(c.getCurrentJobTitle());
        dto.setDepartment(c.getDepartment());
        dto.setHighestEducation(c.getHighestEducation());
        dto.setPrimarySkill(c.getPrimarySkill());
        dto.setDomain(c.getDomain());

        dto.setSkills(c.getSkills());
        dto.setSkillsDetailed(c.getSkillsDetailed());

        dto.setCurrentCompany(c.getCurrentCompany());
        dto.setCurrentCtc(c.getCurrentCtc());

        dto.setEducation(c.getEducation());
        dto.setEducationDetails(c.getEducationDetails());

        dto.setExperienceDetails(c.getExperienceDetails());
        dto.setProjects(c.getProjects());
        dto.setAchievements(c.getAchievements());
        dto.setCertifications(c.getCertifications());
        dto.setPositions(c.getPositions());
        dto.setCodingProfiles(c.getCodingProfiles());
        dto.setLanguages(c.getLanguages());
        dto.setPublications(c.getPublications());
        dto.setActivities(c.getActivities());
        dto.setSectionName(c.getSectionName());
        dto.setSectionData(c.getSectionData());

        dto.setCurrentStage(c.getCurrentStage());
        dto.setStageHistory(c.getStageHistory());

        dto.setCreatedAt(c.getCreatedAt());
        dto.setUpdatedAt(c.getUpdatedAt());

        dto.setResumeUrl(c.getResumeUrl());
        dto.setResumeText(c.getResumeText());

        return dto;
    }

    private CandidateRequestDto mapJsonNodeToRequestDto(JsonNode root) {
        JsonNode data = root.has("data") && root.get("data").isObject() ? root.get("data") : root;
        CandidateRequestDto dto = new CandidateRequestDto();

        dto.setName(firstNonBlank(
                scalarTextValue(data, "fullName"),
                scalarTextValue(data, "name"),
                scalarTextValue(data.path("name"), "raw")
        ));
        dto.setFullName(firstNonBlank(
                scalarTextValue(data, "fullName"),
                scalarTextValue(data, "name"),
                scalarTextValue(data.path("name"), "raw")
        ));
        dto.setFirstName(firstNonBlank(
                scalarTextValue(data, "firstName"),
                scalarTextValue(data.path("name"), "first")
        ));
        dto.setMiddleName(firstNonBlank(
                scalarTextValue(data, "middleName"),
                scalarTextValue(data.path("name"), "middle")
        ));
        dto.setLastName(firstNonBlank(
                scalarTextValue(data, "lastName"),
                scalarTextValue(data.path("name"), "last")
        ));

        dto.setEmail(firstNonBlank(scalarTextValue(data, "email"), firstArrayText(data, "emails")));
        dto.setPhone(firstNonBlank(scalarTextValue(data, "phone"), firstArrayText(data, "phoneNumbers")));
        dto.setAlternatePhone(secondArrayText(data, "phoneNumbers"));
        dto.setDateOfBirth(scalarTextValue(data, "dateOfBirth"));
        dto.setGender(scalarTextValue(data, "gender"));

        dto.setAddressFull(scalarTextValue(data, "addressFull"));
        dto.setCity(scalarTextValue(data, "city"));
        dto.setState(scalarTextValue(data, "state"));
        dto.setCountry(scalarTextValue(data, "country"));
        dto.setPincode(scalarTextValue(data, "pincode"));
        dto.setLocation(firstNonBlank(
                scalarTextValue(data, "location"),
                scalarTextValue(data.path("location"), "formatted"),
                joinNonBlank(", ", scalarTextValue(data, "city"), scalarTextValue(data, "state"), scalarTextValue(data, "country"))
        ));

        dto.setLinkedinUrl(firstNonBlank(scalarTextValue(data, "linkedinUrl"), scalarTextValue(data, "linkedin")));
        dto.setGithubUrl(scalarTextValue(data, "githubUrl"));
        dto.setPortfolioUrl(scalarTextValue(data, "portfolioUrl"));
        dto.setWebsiteUrl(scalarTextValue(data, "websiteUrl"));
        dto.setOtherLinks(firstNode(data, "otherLinks", "websites"));

        dto.setSummaryText(scalarTextValue(data, "summaryText"));
        dto.setCareerObjective(scalarTextValue(data, "careerObjective"));

        dto.setYearsOfExperience(intValue(data, "yearsOfExperience"));
        dto.setTotalExperienceYears(doubleValue(data, "totalExperienceYears", "totalYearsExperience"));
        dto.setCurrentJobTitle(firstNonBlank(
                scalarTextValue(data, "currentJobTitle"),
                nestedScalarTextValue(data, "experience", "0", "jobTitle"),
                scalarTextValue(data, "jobTitle")
        ));
        dto.setCurrentCompany(firstNonBlank(
                scalarTextValue(data, "currentCompany"),
                nestedScalarTextValue(data, "experience", "0", "companyName")
        ));
        dto.setCurrentCtc(scalarTextValue(data, "currentCtc"));
        dto.setHighestEducation(firstNonBlank(
                scalarTextValue(data, "highestEducation"),
                extractEducationSummary(data)
        ));
        dto.setPrimarySkill(scalarTextValue(data, "primarySkill"));
        dto.setDomain(scalarTextValue(data, "domain"));
        dto.setDepartment(firstNonBlank(
                scalarTextValue(data, "department"),
                scalarTextValue(data, "currentJobTitle"),
                scalarTextValue(data, "jobTitle"),
                nestedScalarTextValue(data, "experience", "0", "jobTitle")
        ));

        dto.setSkills(firstNonBlank(
                extractSkillsString(firstNode(data, "skills", "skillsDetailed")),
                scalarTextValue(data, "skills")
        ));
        dto.setEducation(firstNonBlank(
                scalarTextValue(data, "education"),
                scalarTextValue(data, "highestEducation"),
                extractEducationSummary(data)
        ));

        dto.setResumeUrl(scalarTextValue(data, "resumeUrl"));
        dto.setResumeText(scalarTextValue(data, "resumeText"));

        dto.setEducationDetails(firstNode(data, "educationDetails", "education"));
        dto.setExperienceDetails(firstNode(data, "experienceDetails", "experience", "workExperience"));
        dto.setProjects(firstNode(data, "projects"));
        dto.setSkillsDetailed(firstNode(data, "skillsDetailed", "skills"));
        dto.setAchievements(firstNode(data, "achievements"));
        dto.setCertifications(firstNode(data, "certifications"));
        dto.setPositions(firstNode(data, "positions"));
        dto.setCodingProfiles(firstNode(data, "codingProfiles"));
        dto.setLanguages(firstNode(data, "languages"));
        dto.setPublications(firstNode(data, "publications"));
        dto.setActivities(firstNode(data, "activities"));
        dto.setSectionName(firstNode(data, "sectionName"));
        dto.setSectionData(firstNonNullNode(firstNode(data, "sectionData"), firstNode(data, "sections")));

        dto.setCurrentStage(parseStage(scalarTextValue(data, "currentStage")));
        dto.setStageHistory(firstNode(data, "stageHistory"));

        fillMissingFromSectionData(dto, data);

        return dto;
    }

    private void fillMissingFromSectionData(CandidateRequestDto dto, JsonNode data) {
        JsonNode names = firstNode(data, "sectionName");
        JsonNode sections = firstNonNullNode(firstNode(data, "sectionData"), firstNode(data, "sections"));
        if (sections == null) {
            return;
        }

        if (sections.isArray()) {
            for (int i = 0; i < sections.size(); i++) {
                JsonNode section = sections.get(i);
                String sectionName = extractSectionName(names, section, i);
                String sectionText = extractTextFromSection(section);
                if (sectionText == null || sectionText.isBlank()) {
                    continue;
                }

                if (dto.getSummaryText() == null && isSummarySection(sectionName, sectionText)) {
                    dto.setSummaryText(sectionText);
                }

                if (dto.getSkills() == null && isSkillsSection(sectionName, sectionText)) {
                    dto.setSkills(sectionText);
                }

                if (dto.getHighestEducation() == null && isEducationSection(sectionName, sectionText)) {
                    dto.setHighestEducation(sectionText);
                }

                if (dto.getCurrentJobTitle() == null && isExperienceSection(sectionName, sectionText)) {
                    String title = extractCurrentJobTitle(sectionText);
                    if (title != null) {
                        dto.setCurrentJobTitle(title);
                    }
                }

                if (dto.getCurrentCompany() == null && isExperienceSection(sectionName, sectionText)) {
                    String company = extractCurrentCompany(sectionText);
                    if (company != null) {
                        dto.setCurrentCompany(company);
                    }
                }

                if (dto.getEmail() == null) {
                    String email = extractEmail(sectionText);
                    if (email != null) {
                        dto.setEmail(email);
                    }
                }

                if (dto.getPhone() == null) {
                    String phone = extractPhone(sectionText);
                    if (phone != null) {
                        dto.setPhone(phone);
                    }
                }

                if (dto.getFullName() == null) {
                    String name = extractNameFromHeader(sectionText);
                    if (name != null) {
                        dto.setFullName(name);
                        String[] parts = splitName(name);
                        dto.setFirstName(parts[0]);
                        dto.setLastName(parts[1]);
                    }
                }

                if (dto.getLocation() == null && isLocationSection(sectionName, sectionText)) {
                    dto.setLocation(sectionText);
                }

                if (dto.getDepartment() == null && isDepartmentSection(sectionName, sectionText)) {
                    dto.setDepartment(sectionText);
                }
            }
        }
    }

    private String extractSectionName(JsonNode names, JsonNode section, int index) {
        if (names != null && names.isArray() && names.size() > index) {
            JsonNode item = names.get(index);
            if (item != null) {
                String text = item.isTextual() ? item.asText() : textValue(item, "name");
                if (text != null && !text.isBlank()) {
                    return text.trim();
                }
            }
        }
        if (section != null) {
            if (section.isTextual()) {
                return "";
            }
            String sectionName = scalarTextValue(section, "sectionName");
            if (sectionName == null) {
                sectionName = scalarTextValue(section, "name");
            }
            if (sectionName == null && section.has("title")) {
                sectionName = scalarTextValue(section, "title");
            }
            if (sectionName != null) {
                return sectionName;
            }
        }
        return null;
    }

    private String extractTextFromSection(JsonNode section) {
        if (section == null || section.isNull()) {
            return null;
        }
        if (section.isTextual()) {
            return section.asText().trim();
        }
        if (section.isObject() || section.isArray()) {
            StringBuilder sb = new StringBuilder();
            collectText(section, sb);
            return sb.toString().trim();
        }
        return null;
    }

    private void collectText(JsonNode node, StringBuilder sb) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isTextual()) {
            String text = node.asText().trim();
            if (!text.isBlank()) {
                if (sb.length() > 0) {
                    sb.append(" ");
                }
                sb.append(text);
            }
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                collectText(child, sb);
            }
            return;
        }
        if (node.isObject()) {
            for (java.util.Iterator<String> it = node.fieldNames(); it.hasNext(); ) {
                collectText(node.get(it.next()), sb);
            }
        }
    }

    private boolean isSummarySection(String sectionName, String text) {
        String lower = sectionName == null ? "" : sectionName.toLowerCase();
        return lower.contains("summary") || lower.contains("objective") || lower.contains("profile") || lower.contains("about") || text.length() < 300;
    }

    private boolean isSkillsSection(String sectionName, String text) {
        String lower = sectionName == null ? "" : sectionName.toLowerCase();
        return lower.contains("skill") || lower.contains("technologies") || lower.contains("technical");
    }

    private boolean isEducationSection(String sectionName, String text) {
        String lower = sectionName == null ? "" : sectionName.toLowerCase();
        return lower.contains("education") || lower.contains("academics") || lower.contains("qualification");
    }

    private boolean isExperienceSection(String sectionName, String text) {
        String lower = sectionName == null ? "" : sectionName.toLowerCase();
        return lower.contains("experience") || lower.contains("employment") || lower.contains("work");
    }

    private boolean isLocationSection(String sectionName, String text) {
        String lower = sectionName == null ? "" : sectionName.toLowerCase();
        return lower.contains("location") || lower.contains("address") || lower.contains("contact");
    }

    private boolean isDepartmentSection(String sectionName, String text) {
        String lower = sectionName == null ? "" : sectionName.toLowerCase();
        return lower.contains("department") || lower.contains("role") || lower.contains("designation");
    }

    private String extractEmail(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-z]{2,}", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        return matcher.find() ? matcher.group() : null;
    }

    private String extractPhone(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(?:\\+?\\d{1,3}[\\s-]?)?(?:\\(?\\d{2,4}\\)?[\\s-]?)?\\d{6,12}").matcher(text);
        return matcher.find() ? matcher.group() : null;
    }

    private String extractCurrentJobTitle(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(Senior|Lead|Manager|Developer|Engineer|Consultant|Analyst|Architect|Specialist|Director)[^\\n,;]{1,50}", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        return matcher.find() ? matcher.group().trim() : null;
    }

    private String extractCurrentCompany(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(at|@)\\s*([A-Za-z0-9&.,'()\\- ]{2,50})", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        if (matcher.find()) {
            return matcher.group(2).trim();
        }
        return null;
    }

    private String extractNameFromHeader(String text) {
        if (text == null) {
            return null;
        }
        String[] lines = text.split("[\\r\\n]+");
        if (lines.length > 0) {
            String candidate = lines[0].trim();
            if (candidate.length() > 2 && candidate.length() < 60 && !candidate.contains("@") && !candidate.matches(".*\\d.*")) {
                return candidate;
            }
        }
        return null;
    }

    private String resolveFullName(CandidateRequestDto dto) {
        return firstNonBlank(
                dto.getFullName(),
                dto.getName(),
                joinNonBlank(" ", dto.getFirstName(), dto.getMiddleName(), dto.getLastName())
        );
    }

    private String[] splitName(String fullName) {
        String normalized = fullName == null ? "" : fullName.trim();
        if (normalized.isEmpty()) {
            return new String[]{"", ""};
        }

        String[] parts = normalized.split("\\s+");
        String first = parts.length > 0 ? parts[0] : "";
        String last = parts.length > 1 ? parts[parts.length - 1] : "";
        return new String[]{first, last};
    }

    private String toJson(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        return node.toString();
    }

    private String textValue(JsonNode node, String field) {
        if (node == null || field == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }

        JsonNode value = node.get(field);
        if (value.isValueNode()) {
            String text = value.asText();
            return text == null || text.isBlank() ? null : text.trim();
        }

        return value.toString();
    }

    private String scalarTextValue(JsonNode node, String field) {
        if (node == null || field == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }

        JsonNode value = node.get(field);
        if (!value.isValueNode()) {
            return null;
        }

        String text = value.asText();
        return text == null || text.isBlank() ? null : text.trim();
    }

    private JsonNode firstNode(JsonNode node, String... fields) {
        if (node == null) {
            return null;
        }

        for (String field : fields) {
            if (node.has(field) && !node.get(field).isNull()) {
                return node.get(field);
            }
        }

        return null;
    }

    private JsonNode nestedNode(JsonNode node, String... path) {
        if (node == null) {
            return null;
        }

        JsonNode current = node;
        for (String segment : path) {
            if (current == null || current.isNull() || current.isMissingNode()) {
                return null;
            }
            if (segment.matches("\\d+")) {
                int index = Integer.parseInt(segment);
                if (!current.isArray() || current.size() <= index) {
                    return null;
                }
                current = current.get(index);
            } else {
                current = current.get(segment);
            }
        }
        return current;
    }

    private String nestedScalarTextValue(JsonNode node, String... path) {
        JsonNode value = nestedNode(node, path);
        if (value == null || value.isNull() || !value.isValueNode()) {
            return null;
        }

        String text = value.asText();
        return text == null || text.isBlank() ? null : text.trim();
    }

    private String extractEducationSummary(JsonNode data) {
        JsonNode educationNode = firstNode(data, "education");
        if (educationNode != null && educationNode.isArray() && educationNode.size() > 0) {
            JsonNode first = educationNode.get(0);
            String degree = firstNonBlank(
                    textValue(first, "degree"),
                    textValue(first, "fieldOfStudy"),
                    textValue(first, "specialization")
            );
            String institution = firstNonBlank(
                    textValue(first, "institutionName"),
                    textValue(first, "institutionLocation")
            );
            return firstNonBlank(degree, institution);
        }
        return null;
    }

    private JsonNode firstNonNullNode(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isNull() && !node.isMissingNode()) {
                return node;
            }
        }
        return null;
    }

    private String firstArrayText(JsonNode node, String field) {
        JsonNode array = firstNode(node, field);
        if (array != null && array.isArray() && array.size() > 0) {
            return array.get(0).asText(null);
        }
        return null;
    }

    private String secondArrayText(JsonNode node, String field) {
        JsonNode array = firstNode(node, field);
        if (array != null && array.isArray() && array.size() > 1) {
            return array.get(1).asText(null);
        }
        return null;
    }

    private Integer intValue(JsonNode node, String field) {
        JsonNode value = firstNode(node, field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isInt() || value.isLong()) {
            return value.intValue();
        }

        String text = value.asText(null);
        if (text == null || text.isBlank()) {
            return null;
        }

        try {
            return Integer.valueOf(text);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Double doubleValue(JsonNode node, String... fields) {
        JsonNode value = firstNode(node, fields);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            return value.doubleValue();
        }

        String text = value.asText(null);
        if (text == null || text.isBlank()) {
            return null;
        }

        try {
            return Double.valueOf(text);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private LocalDate parseLocalDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (Exception ex) {
            return null;
        }
    }

    private PipelineStage parseStage(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return PipelineStage.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String extractSkillsString(JsonNode skillsNode) {
        if (skillsNode == null || skillsNode.isNull()) {
            return null;
        }

        if (skillsNode.isTextual()) {
            return skillsNode.asText();
        }

        if (!skillsNode.isArray()) {
            return null;
        }

        StringBuilder builder = new StringBuilder();
        Iterator<JsonNode> iterator = skillsNode.elements();
        while (iterator.hasNext()) {
            JsonNode skill = iterator.next();
            String skillText = firstNonBlank(
                    textValue(skill, "skillName"),
                    textValue(skill, "name"),
                    skill.isTextual() ? skill.asText() : null
            );
            if (skillText != null) {
                if (builder.length() > 0) {
                    builder.append(", ");
                }
                builder.append(skillText);
            }
        }

        return builder.length() == 0 ? null : builder.toString();
    }

    private String joinNonBlank(String delimiter, String... values) {
        return java.util.Arrays.stream(values)
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .collect(Collectors.joining(delimiter));
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private CandidateRequestDto enrichDtoFromResume(CandidateRequestDto dto) throws Exception {
        if ((dto.getResumeUrl() == null || dto.getResumeUrl().isBlank())
                && (dto.getResumeText() == null || dto.getResumeText().isBlank())) {
            return dto;
        }

        CandidateRequestDto parsed = null;

        // Try Affinda using resume URL if API key available
        if (affindaApiKey != null && !affindaApiKey.isBlank() && dto.getResumeUrl() != null && !dto.getResumeUrl().isBlank()) {
            try {
                byte[] bytes = restTemplate.getForObject(dto.getResumeUrl(), byte[].class);
                if (bytes != null && bytes.length > 0) {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setBearerAuth(affindaApiKey);
                    headers.setContentType(MediaType.MULTIPART_FORM_DATA);

                    org.springframework.util.MultiValueMap<String, Object> body = new org.springframework.util.LinkedMultiValueMap<>();
                    body.add("file", new org.springframework.core.io.ByteArrayResource(bytes) {
                        @Override
                        public String getFilename() {
                            return "resume";
                        }
                    });

                    HttpEntity<org.springframework.util.MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);
                    ResponseEntity<String> response = restTemplate.exchange(
                            AFFINDA_API_URL,
                            HttpMethod.POST,
                            requestEntity,
                            String.class
                    );

                    String json = response.getBody();
                    if (json != null && !json.isBlank()) {
                        parsed = mapJsonNodeToRequestDto(objectMapper.readTree(json));
                    }
                }
            } catch (Exception ex) {
                // ignore and fall back to text parsing
            }
        }

        // If Affinda not used or failed, try parsing plain text
        if (parsed == null && dto.getResumeText() != null && !dto.getResumeText().isBlank()) {
            parsed = parsePlainTextResume(dto.getResumeText());
        }

        if (parsed == null) {
            return dto;
        }

        // Prefer frontend-provided minimal fields (name, email, department, resume links/text)
        parsed.setName(firstNonBlank(dto.getName(), parsed.getName()));
        parsed.setFullName(firstNonBlank(dto.getFullName(), parsed.getFullName()));
        parsed.setFirstName(firstNonBlank(dto.getFirstName(), parsed.getFirstName()));
        parsed.setLastName(firstNonBlank(dto.getLastName(), parsed.getLastName()));
        parsed.setEmail(firstNonBlank(dto.getEmail(), parsed.getEmail()));
        parsed.setDepartment(firstNonBlank(dto.getDepartment(), parsed.getDepartment()));
        parsed.setResumeUrl(firstNonBlank(dto.getResumeUrl(), parsed.getResumeUrl()));
        parsed.setResumeText(firstNonBlank(dto.getResumeText(), parsed.getResumeText()));

        return parsed;
    }

    private CandidateRequestDto parsePlainTextResume(String text) {
        CandidateRequestDto dto = new CandidateRequestDto();

        if (text == null || text.isBlank()) return dto;

        // Email
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-z]{2,}", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) dto.setEmail(m.group());

        // Phone (very permissive)
        m = java.util.regex.Pattern.compile("(?:\\+?\\d{1,3}[\\s-]?)?(?:\\(?\\d{2,4}\\)?[\\s-]?)?\\d{6,12}").matcher(text);
        if (m.find()) dto.setPhone(m.group());

        // Skills section
        java.util.regex.Matcher skillsMatcher = java.util.regex.Pattern.compile("(?im)^\\s*(Skills|SKILLS)[:\\-]?\\s*(.+)$", java.util.regex.Pattern.MULTILINE).matcher(text);
        if (skillsMatcher.find()) dto.setSkills(skillsMatcher.group(2).trim());

        // Education section
        java.util.regex.Matcher eduMatcher = java.util.regex.Pattern.compile("(?im)^\\s*(Education|EDUCATION)[:\\-]?\\s*(.+)$", java.util.regex.Pattern.MULTILINE).matcher(text);
        if (eduMatcher.find()) dto.setHighestEducation(eduMatcher.group(2).trim());

        // Short summary fallback
        String cleaned = text.replaceAll("\\r", " ").trim();
        dto.setSummaryText(cleaned.length() > 300 ? cleaned.substring(0, 300) : cleaned);

        return dto;
    }
}