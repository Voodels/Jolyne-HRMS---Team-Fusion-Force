package com.example.demo.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import com.example.demo.dto.JobRequestDto;
import com.example.demo.dto.JobResponseDto;

public interface JobService {
    JobResponseDto createJob(JobRequestDto jobDto);
    JobResponseDto updateJob(Long id, JobRequestDto jobDto);
    JobResponseDto getJobById(Long id);
    List<JobResponseDto> getAllJobs();
    Page<JobResponseDto> getAllJobs(Pageable pageable);
    void deleteJob(Long id);
}
