package com.example.demo.dto;

import java.util.List;

import lombok.Data;

@Data
public class DashboardResponseDto {
    private DashboardSummaryDto summary;
    private List<DashboardPipelineDto> pipelineStages;
    private List<DashboardChartPointDto> chartData;
}
