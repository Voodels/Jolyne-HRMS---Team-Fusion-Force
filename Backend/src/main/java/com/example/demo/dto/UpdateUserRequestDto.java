package com.example.demo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdateUserRequestDto {

    @NotBlank
    private String name;

    @Email
    @NotBlank
    private String email;

    private String password;

    @NotBlank
    private String role;

    @Email
    @NotBlank
    private String requesterEmail;

    @NotBlank
    private String requesterPassword;
}
