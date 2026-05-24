package com.example.demo.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.example.demo.dto.JobRequestDto;
import com.example.demo.dto.JobResponseDto;
import com.example.demo.service.JobService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/jobs")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class JobController {

    private static final Logger logger = LoggerFactory.getLogger(JobController.class);
    private final JobService jobService;

    @PostMapping
    public ResponseEntity<JobResponseDto> createJob(@Valid @RequestBody JobRequestDto jobDto) {
        logger.info("POST /api/v1/jobs | create job: {}", jobDto.getTitle());
        JobResponseDto result = jobService.createJob(jobDto);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @GetMapping
    public ResponseEntity<List<JobResponseDto>> getAllJobs() {
        logger.info("GET /api/v1/jobs | list all jobs");
        return ResponseEntity.ok(jobService.getAllJobs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobResponseDto> getJobById(@PathVariable Long id) {
        logger.info("GET /api/v1/jobs/{}", id);
        return ResponseEntity.ok(jobService.getJobById(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<JobResponseDto> updateJob(
            @PathVariable Long id,
            @Valid @RequestBody JobRequestDto jobDto) {
        logger.info("PUT /api/v1/jobs/{} | update job", id);
        return ResponseEntity.ok(jobService.updateJob(id, jobDto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteJob(@PathVariable Long id) {
        logger.info("DELETE /api/v1/jobs/{}", id);
        jobService.deleteJob(id);
        return ResponseEntity.noContent().build();
    }
}
