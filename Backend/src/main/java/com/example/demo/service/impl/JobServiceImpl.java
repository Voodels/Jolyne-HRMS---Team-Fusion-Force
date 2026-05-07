package com.example.demo.service.impl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.demo.dto.JobRequestDto;
import com.example.demo.dto.JobResponseDto;
import com.example.demo.entity.Job;
import com.example.demo.repository.JobRepository;
import com.example.demo.service.JobService;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class JobServiceImpl implements JobService {

    private final JobRepository jobRepository;

    @Override
    public JobResponseDto createJob(JobRequestDto jobDto) {
        Job job = mapToEntity(jobDto);
        Job saved = jobRepository.save(job);
        return convertToDto(saved);
    }

    @Override
    public JobResponseDto updateJob(Long id, JobRequestDto jobDto) {
        Job job = getJob(id);
        job.setTitle(jobDto.getTitle());
        job.setManager(jobDto.getManager());
        job.setFileName(jobDto.getFileName());
        job.setDescription(jobDto.getDescription());
        return convertToDto(jobRepository.save(job));
    }

    @Override
    public JobResponseDto getJobById(Long id) {
        return convertToDto(getJob(id));
    }

    @Override
    public List<JobResponseDto> getAllJobs() {
        return jobRepository.findAll()
                .stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Override
    public Page<JobResponseDto> getAllJobs(Pageable pageable) {
        return jobRepository.findAll(pageable)
                .map(this::convertToDto);
    }

    @Override
    public void deleteJob(Long id) {
        if (!jobRepository.existsById(id)) {
            throw new EntityNotFoundException("Job not found with id: " + id);
        }
        jobRepository.deleteById(id);
    }

    private Job getJob(Long id) {
        return jobRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Job not found with id: " + id));
    }

    private Job mapToEntity(JobRequestDto dto) {
        return Job.builder()
                .title(dto.getTitle())
                .manager(dto.getManager())
                .fileName(dto.getFileName())
                .description(dto.getDescription())
                .build();
    }

    private JobResponseDto convertToDto(Job job) {
        JobResponseDto dto = new JobResponseDto();
        dto.setId(job.getId());
        dto.setTitle(job.getTitle());
        dto.setManager(job.getManager());
        dto.setFileName(job.getFileName());
        dto.setDescription(job.getDescription());
        dto.setCreatedAt(job.getCreatedAt());
        dto.setUpdatedAt(job.getUpdatedAt());

        LocalDateTime timestamp = job.getUpdatedAt() != null ? job.getUpdatedAt() : job.getCreatedAt();
        dto.setLastUpdated(timestamp != null ? timestamp.toLocalDate().toString() : null);
        return dto;
    }
}
