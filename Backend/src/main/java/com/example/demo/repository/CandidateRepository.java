package com.example.demo.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.example.demo.entity.Candidate;
import com.example.demo.enums.PipelineStage;

@Repository
public interface CandidateRepository extends JpaRepository<Candidate, Long> {

	// Find by email (unique)
	Candidate findByEmail(String email);

	// Find candidates by their current pipeline stage
	List<Candidate> findByCurrentStage(PipelineStage stage);

	// Count candidates by stage
	long countByCurrentStage(PipelineStage stage);

	// Candidates created after a given timestamp
	List<Candidate> findByCreatedAtAfter(LocalDateTime from);

	// Paginated search by skills (case-insensitive)
	Page<Candidate> findBySkillsContainingIgnoreCase(String skill, Pageable pageable);

	// Custom query: Search candidates by name
	@Query("SELECT c FROM Candidate c WHERE LOWER(c.firstName) LIKE LOWER(CONCAT('%', :name, '%')) OR LOWER(c.lastName) LIKE LOWER(CONCAT('%', :name, '%'))")
	List<Candidate> searchByName(@Param("name") String name);

	// Vector similarity search using pgvector
	@Query(value = "SELECT * FROM candidates ORDER BY embedding <-> cast(:embedding as vector) LIMIT :limit", nativeQuery = true)
	List<Candidate> findNearestByEmbedding(@Param("embedding") String embedding, @Param("limit") int limit);
}