package com.example.demo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateUserRequestDto {

    @NotBlank
    private String name;

    @Email
    @NotBlank
    private String email;

    @NotBlank
    private String password;

    @NotBlank
    private String role;

    @Email
    @NotBlank
    private String createdByEmail;

    @NotBlank
    private String createdByPassword;
}
