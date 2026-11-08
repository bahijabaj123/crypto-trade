package com.cryptotrade.backend.config;

import com.cryptotrade.backend.security.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Branche le controle d'acces sur toutes les routes /api. */
@Configuration
public class AuthConfig implements WebMvcConfigurer {

    private final AuthInterceptor interceptor;

    public AuthConfig(AuthInterceptor interceptor) {
        this.interceptor = interceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor).addPathPatterns("/api/**");
    }
}
