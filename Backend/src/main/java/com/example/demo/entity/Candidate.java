package com.example.demo.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.Type;

import com.example.demo.enums.PipelineStage;
import com.vladmihalcea.hibernate.type.json.JsonType;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "candidates")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Candidate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // =========================
    // PERSONAL INFORMATION
    // =========================

    private String fullName;

    @Column(nullable = false)
    private String firstName;

    private String middleName;

    @Column(nullable = false)
    private String lastName;

    @Column(unique = true, nullable = false)
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

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String otherLinks;

    // =========================
    // SUMMARY
    // =========================

    @Column(columnDefinition = "TEXT")
    private String summaryText;

    @Column(columnDefinition = "TEXT")
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

    @Column(name = "resume_url")
    private String resumeUrl;

    @Column(columnDefinition = "TEXT")
    private String skills;

    @Column(columnDefinition = "TEXT")
    private String resumeText;

    private String education;

    // =========================
    // JSONB RESUME SECTIONS
    // =========================

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String educationDetails;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String experienceDetails;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String projects;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String skillsDetailed;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String achievements;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String certifications;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String positions;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String codingProfiles;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String languages;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String publications;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String activities;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String sectionName;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String sectionData;

    // =========================
    // PIPELINE
    // =========================

    @Enumerated(EnumType.STRING)
    private PipelineStage currentStage;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private String stageHistory;

    // =========================
    // TIMESTAMPS
    // =========================

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    // =========================
    // HELPER METHODS
    // =========================

    public String getFullNameComputed() {
        return (firstName != null ? firstName : "") + " " +
               (lastName != null ? lastName : "");
    }

    public void updateStage(PipelineStage newStage) {
        this.currentStage = newStage;
    }
}