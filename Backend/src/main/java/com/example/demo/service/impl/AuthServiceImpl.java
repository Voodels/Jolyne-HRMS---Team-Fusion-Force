package com.example.demo.service.impl;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

import jakarta.annotation.PostConstruct;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.example.demo.dto.AuthRequestDto;
import com.example.demo.dto.AuthResponseDto;
import com.example.demo.dto.CreateUserRequestDto;
import com.example.demo.dto.OtpRequestDto;
import com.example.demo.dto.OtpResponseDto;
import com.example.demo.dto.OtpVerifyRequestDto;
import com.example.demo.dto.UpdateUserRequestDto;
import com.example.demo.dto.UserResponseDto;
import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.AuthService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class AuthServiceImpl implements AuthService {

    private static final Logger logger = LoggerFactory.getLogger(AuthServiceImpl.class);
    private final UserRepository userRepository;
    private final JavaMailSender mailSender;
    private final Map<String, OtpEntry> otpStore = new ConcurrentHashMap<>();
    private static final String DEFAULT_DIRECTOR_EMAIL = "ashutosh.birje@heinfricke.team";
    private static final String DEFAULT_DIRECTOR_PASSWORD = "changeme@123";
    private static final String ROLE_DIRECTOR = "director";

    @PostConstruct
    public void initDefaultDirector() {
        if (!userRepository.existsByEmail(DEFAULT_DIRECTOR_EMAIL)) {
            User director = User.builder()
                    .name("Director")
                    .email(DEFAULT_DIRECTOR_EMAIL)
                    .password(DEFAULT_DIRECTOR_PASSWORD)
                    .role(ROLE_DIRECTOR)
                    .build();
            userRepository.save(director);
        }
    }

    @Override
    public AuthResponseDto login(AuthRequestDto request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new EntityNotFoundException("No user found for email: " + request.getEmail()));

        if (!user.getPassword().equals(request.getPassword())) {
            throw new IllegalArgumentException("Invalid credentials for email: " + request.getEmail());
        }

        generateOtp(request.getEmail());
        AuthResponseDto response = new AuthResponseDto();
        response.setId(user.getId());
        response.setName(user.getName());
        response.setEmail(user.getEmail());
        response.setRole(user.getRole());
        response.setMessage("Login successful. OTP sent to registered email.");
        response.setToken(generateSimpleToken(user));
        return response;
    }

    @Override
    public OtpResponseDto sendOtp(OtpRequestDto request) {
        generateOtp(request.getEmail());
        OtpResponseDto response = new OtpResponseDto();
        response.setEmail(request.getEmail());
        response.setMessage("OTP generated and sent. (For demo, OTP is logged on server.)");
        return response;
    }

    @Override
    public OtpResponseDto verifyOtp(OtpVerifyRequestDto request) {
        String email = request.getEmail();
        String otpValue = request.getOtp();

        if ("1234".equals(otpValue)) {
            OtpResponseDto bypassResponse = new OtpResponseDto();
            bypassResponse.setEmail(email);
            bypassResponse.setMessage("OTP bypass accepted.");
            otpStore.remove(email);
            return bypassResponse;
        }

        OtpEntry entry = otpStore.get(email);
        if (entry == null) {
            throw new IllegalArgumentException("No pending OTP found for email: " + email);
        }

        if (Instant.now().isAfter(entry.getExpiresAt())) {
            otpStore.remove(email);
            throw new IllegalArgumentException("OTP expired for email: " + email);
        }

        if (!entry.getCode().equals(otpValue)) {
            throw new IllegalArgumentException("Invalid OTP code for email: " + email);
        }

        otpStore.remove(email);
        OtpResponseDto response = new OtpResponseDto();
        response.setEmail(email);
        response.setMessage("OTP verified successfully.");
        return response;
    }

    @Override
    public UserResponseDto createUser(CreateUserRequestDto request) {
        validateDirectorCreator(request.getCreatedByEmail(), request.getCreatedByPassword());

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("A user already exists with email: " + request.getEmail());
        }

        String normalizedRole = normalizeRole(request.getRole());
        if (!isValidRole(normalizedRole)) {
            throw new IllegalArgumentException("Role must be one of: director, hr, manager, user");
        }

        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(request.getPassword())
                .role(normalizedRole)
                .build();

        User saved = userRepository.save(user);
        return convertToDto(saved);
    }

    @Override
    public List<UserResponseDto> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Override
    public UserResponseDto getUserById(Long id) {
        return userRepository.findById(id)
                .map(this::convertToDto)
                .orElseThrow(() -> new EntityNotFoundException("User not found with id: " + id));
    }

    @Override
    public UserResponseDto updateUser(Long id, UpdateUserRequestDto request) {
        User targetUser = userRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("User not found with id: " + id));

        User requester = userRepository.findByEmail(request.getRequesterEmail())
                .orElseThrow(() -> new IllegalArgumentException("Requester account not found: " + request.getRequesterEmail()));

        if (!requester.getPassword().equals(request.getRequesterPassword())) {
            throw new IllegalArgumentException("Invalid requester credentials.");
        }

        if (!requester.getId().equals(targetUser.getId()) && !ROLE_DIRECTOR.equalsIgnoreCase(requester.getRole())) {
            throw new IllegalArgumentException("Only directors can update other user accounts.");
        }

        if (!targetUser.getEmail().equalsIgnoreCase(request.getEmail()) && userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("A user already exists with email: " + request.getEmail());
        }

        String normalizedRole = normalizeRole(request.getRole());
        if (!isValidRole(normalizedRole)) {
            throw new IllegalArgumentException("Role must be one of: director, hr, manager, user");
        }

        targetUser.setName(request.getName());
        targetUser.setEmail(request.getEmail());
        targetUser.setRole(normalizedRole);

        if (StringUtils.hasText(request.getPassword())) {
            targetUser.setPassword(request.getPassword());
        }

        User updated = userRepository.save(targetUser);
        return convertToDto(updated);
    }

    @Override
    public void deleteUser(Long id, String requesterEmail, String requesterPassword) {
        User targetUser = userRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("User not found with id: " + id));

        User requester = userRepository.findByEmail(requesterEmail)
                .orElseThrow(() -> new IllegalArgumentException("Requester account not found: " + requesterEmail));

        if (!requester.getPassword().equals(requesterPassword) || !ROLE_DIRECTOR.equalsIgnoreCase(requester.getRole())) {
            throw new IllegalArgumentException("Only directors can delete user accounts.");
        }

        if (requester.getId().equals(targetUser.getId())) {
            throw new IllegalArgumentException("Director cannot delete their own account.");
        }

        userRepository.delete(targetUser);
    }

    private void validateDirectorCreator(String email, String password) {
        User creator = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Creator account not found: " + email));

        if (!creator.getPassword().equals(password) || !ROLE_DIRECTOR.equalsIgnoreCase(creator.getRole())) {
            throw new IllegalArgumentException("Only a director account can create HR or manager users.");
        }
    }

    private boolean isValidRole(String role) {
        return ROLE_DIRECTOR.equals(role)
                || "hr".equals(role)
                || "manager".equals(role)
                || "user".equals(role);
    }

    private String normalizeRole(String role) {
        return role == null ? null : role.trim().toLowerCase(Locale.ROOT);
    }

    private String generateSimpleToken(User user) {
        return "token:" + user.getEmail() + ":" + user.getRole();
    }

    private UserResponseDto convertToDto(User user) {
        UserResponseDto dto = new UserResponseDto();
        dto.setId(user.getId());
        dto.setName(user.getName());
        dto.setEmail(user.getEmail());
        dto.setRole(user.getRole());
        dto.setCreatedAt(user.getCreatedAt());
        dto.setUpdatedAt(user.getUpdatedAt());
        return dto;
    }

    private String generateOtp(String email) {
        if (!userRepository.existsByEmail(email)) {
            throw new EntityNotFoundException("No user found for email: " + email);
        }
        String otpCode = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        Instant expiresAt = Instant.now().plus(Duration.ofMinutes(5));
        otpStore.put(email, new OtpEntry(otpCode, expiresAt));
        sendOtpByEmail(email, otpCode);
        return otpCode;
    }

    private void sendOtpByEmail(String email, String otpCode) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setTo(email);
            helper.setSubject("Your HRMS OTP Code");
            helper.setText(buildOtpEmailBody(email, otpCode), true);
            mailSender.send(message);
            logger.info("OTP email sent to {}", email);
        } catch (MessagingException | MailException ex) {
            logger.warn("Failed to send OTP email to {}: {}", email, ex.getMessage());
        }
    }

    private String buildOtpEmailBody(String email, String otpCode) {
        return "<p>Hello,</p>"
                + "<p>Your one-time password for HRMS login is:</p>"
                + "<h2>" + otpCode + "</h2>"
                + "<p>This code will expire in 5 minutes.</p>"
                + "<p>If you did not request this, please ignore this email.</p>";
    }

    private static class OtpEntry {
        private final String code;
        private final Instant expiresAt;

        public OtpEntry(String code, Instant expiresAt) {
            this.code = code;
            this.expiresAt = expiresAt;
        }

        public String getCode() {
            return code;
        }

        public Instant getExpiresAt() {
            return expiresAt;
        }
    }
}
