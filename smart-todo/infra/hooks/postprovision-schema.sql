-- SmartTodo database schema + seed (idempotent).
-- Applied by infra/hooks/postprovision.js after the Function managed-identity
-- SQL user is created. Safe to re-run: DDL is guarded and seed rows are only
-- inserted when the Todos table is empty.

IF OBJECT_ID('dbo.Todos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Todos (
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
    CREATE INDEX IX_Todos_UserId ON dbo.Todos(userId);
GO

IF OBJECT_ID('dbo.ActionSteps', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ActionSteps (
        id NVARCHAR(36) PRIMARY KEY,
        todoId NVARCHAR(36) NOT NULL,
        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(1000) NOT NULL,
        [order] INT NOT NULL,
        isCompleted BIT NOT NULL DEFAULT 0,
        createdAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT FK_ActionSteps_Todos FOREIGN KEY (todoId) REFERENCES dbo.Todos(id) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActionSteps_TodoId' AND object_id = OBJECT_ID('dbo.ActionSteps'))
    CREATE INDEX IX_ActionSteps_TodoId ON dbo.ActionSteps(todoId);
GO

-- Seed data (only when empty).
IF NOT EXISTS (SELECT 1 FROM dbo.Todos)
BEGIN
    INSERT INTO dbo.Todos (id, title, status, userId, stepsGenerated) VALUES
        ('todo-1', 'Prepare Conference talk', 'pending', 'user-1', 0),
        ('todo-2', 'Set up home office', 'in_progress', 'user-1', 1),
        ('todo-3', 'Plan weekend hiking trip', 'completed', 'user-1', 1);

    INSERT INTO dbo.ActionSteps (id, todoId, title, description, [order], isCompleted) VALUES
        ('step-2-1', 'todo-2', 'Choose a desk and chair', 'Pick an ergonomic desk and adjustable chair that fit your space and budget.', 1, 1),
        ('step-2-2', 'todo-2', 'Set up monitor and peripherals', 'Position the monitor at eye level and connect the keyboard, mouse, and webcam.', 2, 1),
        ('step-2-3', 'todo-2', 'Organize cable management', 'Route and bundle cables with clips or a tray to keep the desk tidy.', 3, 0),
        ('step-2-4', 'todo-2', 'Set up lighting', 'Add a desk lamp and reduce glare so the workspace is well lit for calls.', 4, 0),
        ('step-3-1', 'todo-3', 'Pick a trail', 'Choose a trail that matches your group''s fitness level and available time.', 1, 1),
        ('step-3-2', 'todo-3', 'Check weather forecast', 'Review the forecast for the trail area and plan clothing accordingly.', 2, 1),
        ('step-3-3', 'todo-3', 'Pack gear and supplies', 'Pack water, snacks, a first-aid kit, map, and layers for changing weather.', 3, 1);
END;
GO
