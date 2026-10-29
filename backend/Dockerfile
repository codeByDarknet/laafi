# syntax=docker/dockerfile:1
# Backend console DGTD (Laafi) - image multi-étapes.

# --- Étape 1 : compilation ---
FROM maven:3.10.0-eclipse-temurin-21-noble AS build
WORKDIR /src
# Résolution des dépendances séparée pour profiter du cache de couches.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

# --- Étape 2 : exécution ---
FROM eclipse-temurin:21.0.13_9-jre-noble
RUN groupadd --system laafi \
 && useradd --system --gid laafi --home-dir /opt/laafi --shell /usr/sbin/nologin laafi \
 && mkdir -p /opt/laafi /var/lib/laafi/cles \
 && chown -R laafi:laafi /opt/laafi /var/lib/laafi \
 && chmod 700 /var/lib/laafi/cles
WORKDIR /opt/laafi
COPY --from=build --chown=laafi:laafi /src/target/laafi-backend.jar app.jar
USER laafi
# Clé Ed25519 du journal probant : à monter sur un volume persistant (hors base de données).
VOLUME ["/var/lib/laafi/cles"]
ENV LAAFI_CLES_DIR=/var/lib/laafi/cles \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8090
ENTRYPOINT ["java", "-jar", "/opt/laafi/app.jar"]
