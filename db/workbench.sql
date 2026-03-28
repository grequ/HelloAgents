USE helloagents;

CREATE TABLE IF NOT EXISTS wb_agents (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    owner_team      VARCHAR(200),
    agent_role      VARCHAR(20) DEFAULT 'operator',
    api_type        VARCHAR(20) DEFAULT 'rest',
    api_base_url    VARCHAR(500),
    api_docs_url    VARCHAR(500),
    api_spec        JSON,
    api_key_enc     VARCHAR(500),
    api_auth_type   VARCHAR(30) DEFAULT 'bearer',
    api_auth_config JSON,
    agent_config    JSON,
    status          VARCHAR(30) DEFAULT 'inventoried',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wb_use_cases (
    id                   CHAR(36) PRIMARY KEY,
    agent_id             CHAR(36) NOT NULL,
    name                 VARCHAR(200) NOT NULL,
    description          TEXT,
    trigger_text         TEXT,
    user_input           TEXT,
    expected_output      TEXT,
    sample_conversation  TEXT,
    frequency            VARCHAR(50),
    is_write             BOOLEAN DEFAULT FALSE,
    discovered_endpoints JSON,
    discovered_behavior  TEXT,
    test_results         JSON,
    status               VARCHAR(20) DEFAULT 'draft',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES wb_agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wb_agent_specs (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    agent_ids       JSON,
    use_case_ids    JSON,
    spec_markdown   LONGTEXT,
    tools_json      JSON,
    system_prompt   LONGTEXT,
    skeleton_code   LONGTEXT,
    depends_on      JSON,
    called_by       JSON,
    status          VARCHAR(20) DEFAULT 'draft',
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wb_agent_interactions (
    id              CHAR(36) PRIMARY KEY,
    from_agent_id   CHAR(36) NOT NULL,
    to_agent_id     CHAR(36) NOT NULL,
    use_case_ids    JSON,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_agent_id) REFERENCES wb_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (to_agent_id) REFERENCES wb_agents(id) ON DELETE CASCADE
);
