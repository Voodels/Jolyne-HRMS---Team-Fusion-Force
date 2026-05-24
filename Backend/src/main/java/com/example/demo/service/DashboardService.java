package com.example.demo.service;

import com.example.demo.dto.DashboardResponseDto;

public interface DashboardService {
    DashboardResponseDto getDashboardData(Integer rangeDays);
}
