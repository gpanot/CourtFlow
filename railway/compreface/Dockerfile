FROM exadel/compreface:latest

# Environment variables
ENV POSTGRES_HOST=postgres
ENV POSTGRES_PORT=5432
ENV POSTGRES_USER=compreface
ENV POSTGRES_PASSWORD=compreface123
ENV POSTGRES_DB=compreface
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV API_KEY=your-production-api-key-here

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1
