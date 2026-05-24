package com.example.demo.service;

import java.util.List;

import com.example.demo.dto.AuthRequestDto;
import com.example.demo.dto.AuthResponseDto;
import com.example.demo.dto.CreateUserRequestDto;
import com.example.demo.dto.OtpRequestDto;
import com.example.demo.dto.OtpResponseDto;
import com.example.demo.dto.OtpVerifyRequestDto;
import com.example.demo.dto.UpdateUserRequestDto;
import com.example.demo.dto.UserResponseDto;

public interface AuthService {

    AuthResponseDto login(AuthRequestDto request);

    OtpResponseDto sendOtp(OtpRequestDto request);

    OtpResponseDto verifyOtp(OtpVerifyRequestDto request);

    UserResponseDto createUser(CreateUserRequestDto request);

    List<UserResponseDto> getAllUsers();

    UserResponseDto getUserById(Long id);

    UserResponseDto updateUser(Long id, UpdateUserRequestDto request);

    void deleteUser(Long id, String requesterEmail, String requesterPassword);
}
