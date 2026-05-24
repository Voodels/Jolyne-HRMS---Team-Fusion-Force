package com.example.demo.dto;

import com.example.demo.enums.PipelineStage;
import com.fasterxml.jackson.databind.JsonNode;

import lombok.Data;

@Data
public class CandidateRequestDto {

    // =========================
    // PERSONAL INFO
    // =========================

    private String fullName;
    private String name;
    private String firstName;
    private String middleName;
    private String lastName;

    private String email;
    private String phone;
    private String alternatePhone;

    private String dateOfBirth;
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

    private JsonNode otherLinks;

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

    private String skills; // simple

    private String education;

    private String resumeUrl;
    private String resumeText;

    // =========================
    // JSONB FIELDS
    // =========================

    private JsonNode educationDetails;
    private JsonNode experienceDetails;
    private JsonNode projects;
    private JsonNode skillsDetailed;
    private JsonNode achievements;
    private JsonNode certifications;
    private JsonNode positions;
    private JsonNode codingProfiles;
    private JsonNode languages;
    private JsonNode publications;
    private JsonNode activities;
    private JsonNode sectionName;
    private JsonNode sectionData;

    // =========================
    // PIPELINE
    // =========================

    private PipelineStage currentStage;
    private JsonNode stageHistory;
}