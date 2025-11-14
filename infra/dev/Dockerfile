FROM node:24-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache ca-certificates curl

# Expose NestJS port
EXPOSE 3001

# Copy the entrypoint script
COPY infra/dev/entrypoint.sh /app/infra/dev/entrypoint.sh

# Make the script executable
RUN chmod +x /app/infra/dev/entrypoint.sh
  
# Run the entrypoint script
CMD ["sh", "/app/infra/dev/entrypoint.sh"]

