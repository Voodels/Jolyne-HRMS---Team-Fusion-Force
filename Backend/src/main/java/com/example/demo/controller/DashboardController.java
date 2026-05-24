package com.example.demo.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.example.demo.dto.DashboardResponseDto;
import com.example.demo.service.DashboardService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DashboardController {

    private static final Logger logger = LoggerFactory.getLogger(DashboardController.class);
    private final DashboardService dashboardService;

    @GetMapping
    public ResponseEntity<DashboardResponseDto> getDashboardData(
            @RequestParam(required = false) Integer rangeDays) {
        logger.info("GET /api/v1/dashboard | rangeDays={}", rangeDays);
        DashboardResponseDto response = dashboardService.getDashboardData(rangeDays);
        return ResponseEntity.ok(response);
    }
}
