package com.example.demo.dto;

import lombok.Data;

@Data
public class AuthResponseDto {

    private Long id;
    private String name;
    private String email;
    private String role;
    private String message;
    private String token;
}
