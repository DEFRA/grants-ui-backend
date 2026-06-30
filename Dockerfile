ARG PARENT_VERSION=latest-24
ARG PORT=3000
ARG PORT_DEBUG=9229

FROM defradigital/node-development:${PARENT_VERSION} AS development
ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node-development:${PARENT_VERSION}

ARG PORT
ARG PORT_DEBUG
ENV PORT=${PORT}
EXPOSE ${PORT} ${PORT_DEBUG}

COPY --chown=node:node package*.json ./
COPY --chown=node:node migrate-mongo-config.config.js ./
COPY --chown=node:node migrate-mongo-config.state.js ./
COPY --chown=node:node migrations ./migrations

RUN npm ci
COPY --chown=node:node ./src ./src
COPY --chown=node:node openapi.yaml ./

CMD [ "npm", "run", "docker:dev" ]

FROM defradigital/node:${PARENT_VERSION} AS production
ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node:${PARENT_VERSION}

# Add curl to template.
# CDP PLATFORM HEALTHCHECK REQUIREMENT
USER root
RUN apk add --no-cache curl
USER node

COPY --from=development /home/node/package*.json ./
COPY --from=development /home/node/migrate-mongo-config.config.js ./
COPY --from=development /home/node/migrate-mongo-config.state.js ./
COPY --from=development /home/node/migrations ./migrations
COPY --from=development /home/node/src ./src/
COPY --from=development /home/node/openapi.yaml ./

RUN npm ci --omit=dev

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "src" ]
