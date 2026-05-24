package com.example.demo.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import org.springframework.web.multipart.MultipartFile;

import com.example.demo.dto.CandidateRequestDto;
import com.example.demo.dto.CandidateResponseDto;
import com.example.demo.service.CandidateService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.Value;

@RestController
@RequestMapping("/api/v1/candidates")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CandidateController {

    private static final Logger logger = LoggerFactory.getLogger(CandidateController.class);
    private final CandidateService candidateService;

    @org.springframework.beans.factory.annotation.Value("${spring.datasource.url}")
    private String db_url;

    private void logApiHit(String method, String endpoint, Object... params) {
        String paramStr = params.length > 0 ? " | Params: " + java.util.Arrays.toString(params) : "";
        logger.info("🚀 API HIT | {} {} {}", method, endpoint, paramStr);
    }

    private void logSuccess(String operation, Object data) {
        logger.info("✅ SUCCESS | {} | Result: {}", operation, data);
    }

    private void logError(String operation, Exception e) {
        logger.error("❌ ERROR | {} | Message: {}", operation, e.getMessage(), e);
    }

    // =========================
    // CREATE CANDIDATE
    // =========================
    @PostMapping
    public ResponseEntity<CandidateResponseDto> createCandidate(
            @Valid @RequestBody CandidateRequestDto candidateDto) {
        logApiHit("POST", "/api/v1/candidates", candidateDto.getFirstName() + " " + candidateDto.getLastName());
        try {
            long start = System.currentTimeMillis();
            CandidateResponseDto result = candidateService.createCandidate(candidateDto);
            logger.info("⏱️  EXECUTION TIME | Create Candidate: {}ms", System.currentTimeMillis() - start);
            logSuccess("CREATE CANDIDATE", "ID=" + result.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (Exception e) {
            logError("CREATE CANDIDATE", e);
            throw e;
        }
    }

    // =========================
    // CREATE FROM FULL RESUME JSON
    // =========================
    @PostMapping("/full")
    public ResponseEntity<CandidateResponseDto> createFromFullResume(
            @RequestBody String resumeJson) {
        logApiHit("POST", "/api/v1/candidates/full", "resumeJson length=" + resumeJson.length());
        try {
            long start = System.currentTimeMillis();
            CandidateResponseDto response = candidateService.createFromResumeJson(resumeJson);
            logger.info("⏱️  EXECUTION TIME | Create From Resume: {}ms", System.currentTimeMillis() - start);
            logSuccess("CREATE FROM RESUME", "ID=" + response.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            logError("CREATE FROM RESUME", e);
            throw e;
        }
    }

    // =========================
    // GET BY ID
    // =========================
    @GetMapping("/{id}")
    public ResponseEntity<CandidateResponseDto> getCandidateById(@PathVariable Long id) {
        logApiHit("GET", "/api/v1/candidates/" + id);
        try {
            long start = System.currentTimeMillis();
            CandidateResponseDto result = candidateService.getCandidateById(id);
            logger.info("⏱️  EXECUTION TIME | Get Candidate: {}ms", System.currentTimeMillis() - start);
            logSuccess("GET CANDIDATE", "ID=" + id);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logError("GET CANDIDATE", e);
            throw e;
        }
    }

    // =========================
    // GET ALL (PAGINATED)
    // =========================
    @GetMapping
    public ResponseEntity<Page<CandidateResponseDto>> getAllCandidates(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {

                logger.info("DB Connection URL: {}", db_url);
        logApiHit("GET", "/api/v1/candidates", "page=" + pageable.getPageNumber() + ", size=" + pageable.getPageSize());
        try {
            long start = System.currentTimeMillis();
            Page<CandidateResponseDto> result = candidateService.getAllCandidates(pageable);
            logger.info("⏱️  EXECUTION TIME | Get All Candidates: {}ms | Count: {}", 
                System.currentTimeMillis() - start, result.getNumberOfElements());
            logSuccess("GET ALL CANDIDATES", "Page " + result.getNumber() + " of " + result.getTotalPages());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logError("GET ALL CANDIDATES", e);
            throw e;
        }
    }

    // =========================
    // UPDATE FULL
    // =========================
    @PutMapping("/{id}")
    public ResponseEntity<CandidateResponseDto> updateCandidate(
            @PathVariable Long id,
            @Valid @RequestBody CandidateRequestDto candidateDto) {

        return ResponseEntity.ok(candidateService.updateCandidate(id, candidateDto));
    }

    // =========================
    // UPDATE USING FULL JSON
    // =========================
    @PutMapping("/{id}/full")
    public ResponseEntity<CandidateResponseDto> updateFromResumeJson(
            @PathVariable Long id,
            @RequestBody String resumeJson) {

        return ResponseEntity.ok(candidateService.updateFromResumeJson(id, resumeJson));
    }

    // =========================
    // DELETE
    // =========================
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCandidate(@PathVariable Long id) {
        candidateService.deleteCandidate(id);
        return ResponseEntity.noContent().build();
    }

    // =========================
    // UPDATE PIPELINE STAGE
    // =========================
    @PatchMapping("/{id}/stage")
    public ResponseEntity<CandidateResponseDto> updatePipelineStage(
            @PathVariable Long id,
            @RequestParam String stage) {

        return ResponseEntity.ok(candidateService.updatePipelineStage(id, stage));
    }

    // =========================
    // RESUME UPLOAD (Cloudinary)
    // =========================
    @PostMapping("/upload-resume")
    public ResponseEntity<String> uploadResume(
            @RequestParam("file") MultipartFile file) {
        logApiHit("POST", "/api/v1/candidates/upload-resume", file.getOriginalFilename() + " (" + file.getSize() + " bytes)");
        try {
            long start = System.currentTimeMillis();
            String url = candidateService.uploadResume(file);
            logger.info("⏱️  EXECUTION TIME | Upload Resume: {}ms", System.currentTimeMillis() - start);
            logSuccess("UPLOAD RESUME", "URL=" + url.substring(0, Math.min(50, url.length())) + "...");
            return ResponseEntity.ok(url);
        } catch (Exception e) {
            logError("UPLOAD RESUME", e);
            throw e;
        }
    }

    // =========================
    // SEARCH BY NAME
    // =========================
    @GetMapping("/search")
    public ResponseEntity<List<CandidateResponseDto>> searchByName(
            @RequestParam String name) {

        return ResponseEntity.ok(candidateService.searchCandidatesByName(name));
    }

    // =========================
    // SEARCH BY SKILL (BASIC)
    // =========================
    @GetMapping("/skill")
    public ResponseEntity<Page<CandidateResponseDto>> searchBySkill(
            @RequestParam String skill,
            @PageableDefault(size = 20) Pageable pageable) {

        return ResponseEntity.ok(candidateService.searchCandidatesBySkill(skill, pageable));
    }

    // =========================
    // ADVANCED FILTER (NEW 🔥)
    // =========================
    @GetMapping("/filter")
    public ResponseEntity<Page<CandidateResponseDto>> filterCandidates(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String skill,
            @RequestParam(required = false) String company,
            @RequestParam(required = false) String domain,
            @RequestParam(required = false) Double minExperience,
            @RequestParam(required = false) Double maxExperience,
            @PageableDefault(size = 20) Pageable pageable) {

        return ResponseEntity.ok(
                candidateService.filterCandidates(
                        name, skill, company, domain, minExperience, maxExperience, pageable
                )
        );
    }

    // =========================
    // GET RAW RESUME JSON
    // =========================
    @GetMapping("/{id}/resume-json")
    public ResponseEntity<String> getResumeJson(@PathVariable Long id) {
        logApiHit("GET", "/api/v1/candidates/" + id + "/resume-json");
        try {
            long start = System.currentTimeMillis();
            String result = candidateService.getResumeJson(id);
            logger.info("⏱️  EXECUTION TIME | Get Resume JSON: {}ms", System.currentTimeMillis() - start);
            logSuccess("GET RESUME JSON", "ID=" + id);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logError("GET RESUME JSON", e);
            throw e;
        }
    }

    // =========================
    // PARSE RESUME VIA AFFINDA (PROXY)
    // =========================
    @PostMapping("/parse-resume")
    public ResponseEntity<String> parseResumeViaAffinda(
            @RequestParam("file") MultipartFile file) {
        logApiHit("POST", "/api/v1/candidates/parse-resume", file.getOriginalFilename() + " (" + file.getSize() + " bytes)");
        try {
            long start = System.currentTimeMillis();
            String result = candidateService.parseResumeWithAffinda(file);
            logger.info("⏱️  EXECUTION TIME | Parse Resume: {}ms", System.currentTimeMillis() - start);
            logSuccess("PARSE RESUME", "Parsed successfully");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logError("PARSE RESUME", e);
            throw e;
        }
    }
}