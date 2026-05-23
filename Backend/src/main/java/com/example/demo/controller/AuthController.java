package com.example.demo.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import com.example.demo.dto.AuthRequestDto;
import com.example.demo.dto.AuthResponseDto;
import com.example.demo.dto.CreateUserRequestDto;
import com.example.demo.dto.OtpRequestDto;
import com.example.demo.dto.OtpResponseDto;
import com.example.demo.dto.OtpVerifyRequestDto;
import com.example.demo.dto.UpdateUserRequestDto;
import com.example.demo.dto.UserResponseDto;
import com.example.demo.service.AuthService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
@Validated
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);
    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponseDto> login(@Valid @RequestBody AuthRequestDto request) {
        logger.info("POST /api/v1/auth/login | email={}", request.getEmail());
        AuthResponseDto response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/otp/request")
    public ResponseEntity<OtpResponseDto> requestOtp(@Valid @RequestBody OtpRequestDto request) {
        logger.info("POST /api/v1/auth/otp/request | email={}", request.getEmail());
        OtpResponseDto response = authService.sendOtp(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/otp/verify")
    public ResponseEntity<OtpResponseDto> verifyOtp(@Valid @RequestBody OtpVerifyRequestDto request) {
        logger.info("POST /api/v1/auth/otp/verify | email={}", request.getEmail());
        OtpResponseDto response = authService.verifyOtp(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponseDto> createUser(@Valid @RequestBody CreateUserRequestDto request) {
        logger.info("POST /api/v1/auth/users | creatorEmail={} targetEmail={}", request.getCreatedByEmail(), request.getEmail());
        UserResponseDto created = authService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/users")
    public ResponseEntity<List<UserResponseDto>> getAllUsers() {
        logger.info("GET /api/v1/auth/users");
        return ResponseEntity.ok(authService.getAllUsers());
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<UserResponseDto> getUserById(@PathVariable Long id) {
        logger.info("GET /api/v1/auth/users/{}", id);
        return ResponseEntity.ok(authService.getUserById(id));
    }

    @PatchMapping("/users/{id}")
    public ResponseEntity<UserResponseDto> updateUser(@PathVariable Long id, @Valid @RequestBody UpdateUserRequestDto request) {
        logger.info("PATCH /api/v1/auth/users/{} | requesterEmail={}", id, request.getRequesterEmail());
        return ResponseEntity.ok(authService.updateUser(id, request));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(
            @PathVariable Long id,
            @RequestParam @NotBlank String requesterEmail,
            @RequestParam @NotBlank String requesterPassword) {
        logger.info("DELETE /api/v1/auth/users/{} | requesterEmail={}", id, requesterEmail);
        authService.deleteUser(id, requesterEmail, requesterPassword);
        return ResponseEntity.noContent().build();
    }
}
