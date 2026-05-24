package com.example.demo.dto;

import lombok.Data;

@Data
public class DashboardSummaryDto {
    private long totalCandidates;
    private long activeJobs;
    private long selectedCandidates;
    private long inProgressCandidates;
}
