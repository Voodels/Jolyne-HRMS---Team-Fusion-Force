package com.example.demo.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.example.demo.enums.PipelineStage;

import lombok.Data;

@Data
public class CandidateResponseDto {

    // =========================
    // BASIC INFO
    // =========================
    private Long id;

    private String fullName;
    private String firstName;
    private String middleName;
    private String lastName;

    private String email;
    private String phone;
    private String alternatePhone;

    private LocalDate dateOfBirth;
    private String gender;

    private String addressFull;
    private String city;
    private String state;
    private String country;
    private String pincode;

    private String location;

    // =========================
    // LINKS
    // =========================
    private String linkedinUrl;
    private String githubUrl;
    private String portfolioUrl;
    private String websiteUrl;
    private String otherLinks;

    // =========================
    // SUMMARY
    // =========================
    private String summaryText;
    private String careerObjective;

    // =========================
    // PROFESSIONAL INFO
    // =========================
    private Integer yearsOfExperience;
    private Double totalExperienceYears;

    private String currentJobTitle;
    private String currentCompany;
    private String currentCtc;

    private String highestEducation;
    private String primarySkill;
    private String domain;
    private String activeJob;

    private String department;

    private String skills;
    private String education;

    private String resumeUrl;
    private String resumeText;

    // =========================
    // JSON SECTIONS
    // =========================
    private String educationDetails;
    private String experienceDetails;
    private String projects;
    private String skillsDetailed;
    private String achievements;
    private String certifications;
    private String positions;
    private String codingProfiles;
    private String languages;
    private String publications;
    private String activities;
    private String sectionName;
    private String sectionData;

    // =========================
    // PIPELINE
    // =========================
    private PipelineStage currentStage;
    private String stageHistory;

    // =========================
    // TIMESTAMPS
    // =========================
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}