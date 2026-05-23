package com.example.demo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OtpVerifyRequestDto {

    @Email
    @NotBlank
    private String email;

    @NotBlank
    private String otp;
}
