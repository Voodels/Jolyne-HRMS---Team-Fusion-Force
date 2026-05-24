package com.example.demo.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class JobRequestDto {

    @NotBlank
    private String title;

    @NotBlank
    private String manager;

    private String fileName;

    private String description;
}
