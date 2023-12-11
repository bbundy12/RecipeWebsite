-- Users Table
CREATE TABLE Users (
    user_id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 ),
    PRIMARY KEY (user_id),
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Ingredients Table (Moved up)
CREATE TABLE Ingredients (
    ingredient_id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 ),
    PRIMARY KEY (ingredient_id),
    name VARCHAR(50) NOT NULL,
    category VARCHAR(50)
);

-- Recipes Table
CREATE TABLE Recipes (
    recipe_id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 ),
    PRIMARY KEY (recipe_id),
    user_id INTEGER REFERENCES Users(user_id),
    title VARCHAR(100) NOT NULL,
    servings INTEGER NOT NULL,
    image VARCHAR(100) NOT NULL
);

-- Recipe Ingredients Junction Table
CREATE TABLE Recipe_Ingredients (
    recipe_id INTEGER REFERENCES Recipes(recipe_id),
    ingredient_id INTEGER REFERENCES Ingredients(ingredient_id),
    quantity DECIMAL NOT NULL,
    unit VARCHAR(20) NOT NULL
);
