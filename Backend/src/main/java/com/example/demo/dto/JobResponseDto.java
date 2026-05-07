package com.example.demo.dto;

import java.time.LocalDateTime;

import lombok.Data;

@Data
public class JobResponseDto {
    private Long id;
    private String title;
    private String manager;
    private String fileName;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String lastUpdated;
}
