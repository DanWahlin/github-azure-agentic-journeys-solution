-- SmartTodo database schema (idempotent).
-- Canonical DDL used both at API cold start (see schema.ts) and by the
-- azd post-provision hook (infra/hooks/postprovision-schema.sql in Phase 3).

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
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Todos_UserId' AND object_id = OBJECT_ID('dbo.Todos'))
    CREATE INDEX IX_Todos_UserId ON Todos(userId);
GO

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
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActionSteps_TodoId' AND object_id = OBJECT_ID('dbo.ActionSteps'))
    CREATE INDEX IX_ActionSteps_TodoId ON ActionSteps(todoId);
GO
