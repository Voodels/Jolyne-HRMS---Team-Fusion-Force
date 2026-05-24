package com.example.demo.service.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.demo.dto.DashboardChartPointDto;
import com.example.demo.dto.DashboardPipelineDto;
import com.example.demo.dto.DashboardResponseDto;
import com.example.demo.dto.DashboardSummaryDto;
import com.example.demo.entity.Candidate;
import com.example.demo.repository.CandidateRepository;
import com.example.demo.repository.JobRepository;
import com.example.demo.enums.PipelineStage;
import com.example.demo.service.DashboardService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DashboardServiceImpl implements DashboardService {

    private final CandidateRepository candidateRepository;
    private final JobRepository jobRepository;
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_DATE;

    @Override
    public DashboardResponseDto getDashboardData(Integer rangeDays) {
        int days = (rangeDays == null || rangeDays <= 0) ? 30 : rangeDays;
        LocalDateTime from = LocalDateTime.now().minusDays(days - 1);

        long totalCandidates = candidateRepository.count();
        long selectedCount = candidateRepository.countByCurrentStage(PipelineStage.SELECTED);
        long rejectedCount = candidateRepository.countByCurrentStage(PipelineStage.REJECTED);
        long inProgressCount = Math.max(0, totalCandidates - selectedCount - rejectedCount);

        DashboardSummaryDto summary = new DashboardSummaryDto();
        summary.setTotalCandidates(totalCandidates);
        summary.setActiveJobs(jobRepository.count());
        summary.setSelectedCandidates(selectedCount);
        summary.setInProgressCandidates(inProgressCount);

        List<DashboardPipelineDto> pipelineStages = buildPipelineStageCounts();
        List<DashboardChartPointDto> chartData = buildChartData(from);

        DashboardResponseDto response = new DashboardResponseDto();
        response.setSummary(summary);
        response.setPipelineStages(pipelineStages);
        response.setChartData(chartData);
        return response;
    }

    private List<DashboardPipelineDto> buildPipelineStageCounts() {
        List<DashboardPipelineDto> stages = new ArrayList<>();
        stages.add(createStageDto("Applied", candidateRepository.countByCurrentStage(PipelineStage.APPLIED)));
        stages.add(createStageDto("Screening", candidateRepository.countByCurrentStage(PipelineStage.SCREENING)));
        stages.add(createStageDto("Technical Review", candidateRepository.countByCurrentStage(PipelineStage.TECH_INTERVIEW)));
        stages.add(createStageDto("HR Interview", candidateRepository.countByCurrentStage(PipelineStage.HR_INTERVIEW)));
        stages.add(createStageDto("Selected", candidateRepository.countByCurrentStage(PipelineStage.SELECTED)));
        return stages;
    }

    private DashboardPipelineDto createStageDto(String label, long count) {
        DashboardPipelineDto dto = new DashboardPipelineDto();
        dto.setLabel(label);
        dto.setCount(count);
        return dto;
    }

    private List<DashboardChartPointDto> buildChartData(LocalDateTime from) {
        List<Candidate> candidates = candidateRepository.findByCreatedAtAfter(from.minusSeconds(1));
        Map<LocalDate, Long> grouped = candidates.stream()
                .collect(Collectors.groupingBy(c -> c.getCreatedAt().toLocalDate(), LinkedHashMap::new, Collectors.counting()));

        List<DashboardChartPointDto> chartData = new ArrayList<>();
        LocalDate current = from.toLocalDate();
        LocalDate today = LocalDate.now();

        while (!current.isAfter(today)) {
            DashboardChartPointDto point = new DashboardChartPointDto();
            point.setDate(current.format(DATE_FORMATTER));
            point.setValue(grouped.getOrDefault(current, 0L));
            chartData.add(point);
            current = current.plusDays(1);
        }

        return chartData;
    }
}
