# ---------- 1) compilation ----------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---------- 2) exécution (léger) ----------
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
# Render gratuit = 512 Mo : on limite la mémoire de la JVM
ENV JAVA_OPTS="-Xmx340m -Xss512k -XX:+UseSerialGC"
ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8081
CMD ["sh", "-c", "java $JAVA_OPTS -Dserver.port=${PORT:-8081} -jar app.jar"]
