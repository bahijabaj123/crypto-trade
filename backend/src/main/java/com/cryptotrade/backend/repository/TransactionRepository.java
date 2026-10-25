package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    List<Transaction> findByPortefeuilleIdOrderByDateDesc(Long portefeuilleId);
}
