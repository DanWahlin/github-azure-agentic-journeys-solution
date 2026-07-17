/**
 * Idempotent schema for the SmartTodo API. Safe to run on every cold start:
 * tables and indexes are only created when they do not already exist. The
 * canonical copy also lives in schema.sql for the azd post-provision hook.
 */
export const SCHEMA_SQL = `
IF OBJECT_ID('dbo.Todos', 'U') IS NULL
BEGIN
    CREATE TABLE Todos (
        id NVARCHAR(36) PRIMARY KEY,
        title NVARCHAR(500) NOT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',
        userId NVARCHAR(100) NOT NULL,
        stepsGenerated BIT NOT NULL DEFAULT 0,
        createdAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        updatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Todos_UserId' AND object_id = OBJECT_ID('dbo.Todos'))
    CREATE INDEX IX_Todos_UserId ON Todos(userId);

IF OBJECT_ID('dbo.ActionSteps', 'U') IS NULL
BEGIN
    CREATE TABLE ActionSteps (
        id NVARCHAR(36) PRIMARY KEY,
        todoId NVARCHAR(36) NOT NULL,
        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(1000) NOT NULL,
        [order] INT NOT NULL,
        isCompleted BIT NOT NULL DEFAULT 0,
        createdAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT FK_ActionSteps_Todos FOREIGN KEY (todoId) REFERENCES Todos(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActionSteps_TodoId' AND object_id = OBJECT_ID('dbo.ActionSteps'))
    CREATE INDEX IX_ActionSteps_TodoId ON ActionSteps(todoId);
`;
