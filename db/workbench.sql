USE helloagents;

CREATE TABLE IF NOT EXISTS wb_systems (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    owner_team      VARCHAR(200),
    api_type        VARCHAR(20) DEFAULT 'rest',
    api_base_url    VARCHAR(500),
    api_docs_url    VARCHAR(500),
    api_spec        JSON,
    api_key_enc     VARCHAR(500),
    api_auth_type   VARCHAR(30) DEFAULT 'bearer',
    api_auth_config JSON,
    status          VARCHAR(30) DEFAULT 'inventoried',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wb_use_cases (
    id                   CHAR(36) PRIMARY KEY,
    system_id            CHAR(36) NOT NULL,
    name                 VARCHAR(200) NOT NULL,
    description          TEXT,
    trigger_text         TEXT,
    user_input           TEXT,
    expected_output      TEXT,
    frequency            VARCHAR(50),
    is_write             BOOLEAN DEFAULT FALSE,
    priority             VARCHAR(10) DEFAULT 'medium',
    discovered_endpoints JSON,
    discovered_behavior  TEXT,
    test_results         JSON,
    status               VARCHAR(20) DEFAULT 'draft',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (system_id) REFERENCES wb_systems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wb_agent_specs (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    system_ids      JSON,
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
