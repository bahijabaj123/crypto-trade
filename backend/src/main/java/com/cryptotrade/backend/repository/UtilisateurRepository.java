package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.model.Utilisateur;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UtilisateurRepository extends JpaRepository<Utilisateur, Long> {

    Optional<Utilisateur> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    long countByRole(Role role);

    long countByRoleAndActifTrue(Role role);

    long countByActifFalse();

    List<Utilisateur> findAllByOrderByIdAsc();
}
