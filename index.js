// Brendan Bundy, Mckenna Alder, Tanner Atkin, Jakob Blosil, Secion 003
// This application allows users to add recipes to a database once they have created an account.
// They can edit their account information. They can also edit their recipe information. They can view all
// of their recipe data. The main functionality of the website is that a shopping list can be generated
// for the user after they select the recipes they want to generate th list for.

const express = require("express");

let app = express();

let path = require("path");

const port = process.env.PORT;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DB_NAME,
    port: process.env.RDS_PORT,
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false,
  },
});

knex
  .raw("SELECT * from users")
  .then(() => {
    console.log("Connection to database successful");
    // You can start using your knex instance here
  })
  .catch((err) => {
    console.error("Error connecting to database:", err);
  });

app.get("/", (req, res) => {
  try {
    res.render("index", { error: null });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/createUser", (req, res) => {
  try {
    res.render("createUser", {});
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    // Check if the username and password match a user in the database
    const users = await knex.select("user_id", "username", "password").from("users").where("username", req.body.username).andWhere("password", req.body.password);

    console.log("Number of results:", users.length);

    const user_id = users[0].user_id;

    if (users.length == 1) {
      // If at least one user is found, you can redirect to a different route or render a page
      res.redirect("/userLanding/" + user_id);
    } else {
      // If no user is found, you can render the login page with an error message
      res.render("loginUser", { error: "Invalid username or password" });
    }
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/storeUser", async (req, res) => {
  try {
    // Check if the new username already exists
    const existingUser = await knex("users").where("username", req.body.username).select("username");

    if (existingUser.length > 0) {
      // If the username already exists, render the createUser page with an error
      res.render("createUser", { error: "Username Already Taken" });
      return; // Add return to stop further execution
    } else {
      // If the username is not taken, insert the new user
      await knex("users").insert({ username: req.body.username, password: req.body.password });

      const useridpromise = knex('users').where('username', req.body.username).select('user_id').then((rows) => rows[0].user_id)
      const newid = await useridpromise

      res.redirect("accountCreated/" + newid);
    }
  } catch (err) {
    console.error("Error storing user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/editUser", (req, res) => {
  res.render("editUser");
});

app.post("/updatePassword", async (req, res) => {
  try {
    // Retrieve data from the form submission
    const newPassword = req.body.newPassword;
    const Username = req.body.username;

    const q1 = await knex("users").where("username", Username).select("user_id");
    const user_id = q1[0].user_id;

    // Update the password in the database
    knex("users")
      .where("username", Username)
      .update({ password: newPassword})
      .then(() => {
        // Password updated successfully, redirect to a success page
        res.redirect("/updatedPassword/" + user_id);
      })
      .catch((error) => {
        // Handle database update error (redirect to editUser with an error)
        res.render("editUser", { error: "Error updating password" });
      });
  } catch (error) {
    // Handle other errors (redirect to editUser with a generic error)
    res.render("editUser", { error: "An unexpected error occurred" });
  }
});

app.get("/updatedPassword/:user_id", (req, res) => {
  let user_id = req.params.user_id;
  res.render("updatedPassword", { user_id });
});

app.get("/login", (req, res) => {
  res.render("loginUser");
});

app.get("/recipeSubmitted/:user_id", (req, res) => {
  const user_id = req.params.user_id;
  res.render("recipeSubmitted", { user_id });
});

app.get("/userLanding/:user_id", async (req, res) => {
  try {
    const user_id = req.params.user_id;
    const recipes = await knex("recipes").where("user_id", user_id).select("title", "recipe_id");
    console.log(recipes);
    res.render("userLanding", { recipes, user_id });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/recipeView/:recipe_id", async (req, res) => {
  try {
    console.log(req.params.recipe_id);
    // Fetch the recipe and its related data from the database
    const recipe = await knex("recipes").where("recipe_id", req.params.recipe_id).first(); // Assuming you expect only one recipe per recipe_id
    const ingredients = await knex("ingredients")
      .join("recipe_ingredients", "ingredients.ingredient_id", "recipe_ingredients.ingredient_id")
      .select("ingredients.name", "recipe_ingredients.quantity", "recipe_ingredients.unit")
      .where("recipe_ingredients.recipe_id", req.params.recipe_id);

    // Render the view with the fetched data
    res.render("recipeView", { recipe, ingredients });
  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/shoppingList/:user_id", async (req, res) => {
  try {
    const user_id = req.params.user_id;
    const recipes = await knex("recipes").where("user_id", user_id).select("title", "image", "recipe_id");
    console.log(recipes);
    res.render("shoppingList", { recipes, user_id });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).send("Internal Server Error");
  }
});

// // POST route to aggregate ingredients for selected recipes
app.post("/aggregate_ingredients", async (req, res) => {
  try {
    // Extract selected recipe names from the request
    let title = req.body.recipe_title;

    // If 'titles' is a string, convert it to an array
    if (typeof title === "string") {
      title = [title];
    }

    // If 'titles' is undefined or empty, initialize it as an empty array
    title = title || [];

    // Query to get ingredients
    if (title.length > 0) {
      const ingredientsQuery = await knex
        .select("recipes.title", "ingredients.name", "recipe_ingredients.unit", "recipe_ingredients.quantity")
        .from("recipes")
        .join("recipe_ingredients", "recipes.recipe_id", "=", "recipe_ingredients.recipe_id")
        .join("ingredients", "recipe_ingredients.ingredient_id", "=", "ingredients.ingredient_id")
        .whereIn("recipes.title", title);
      // Array to hold aggregated ingredients
      let aggregatedIngredients = [];

      // Iterate through query results and aggregate quantities
      for (let iQuery = 0; iQuery < ingredientsQuery.length; iQuery++) {
        let bFound = false;
        for (let iNum = 0; iNum < aggregatedIngredients.length && !bFound; iNum++) {
          if (aggregatedIngredients[iNum][0] === ingredientsQuery[iQuery].name && aggregatedIngredients[iNum][2] === ingredientsQuery[iQuery].unit) {
            aggregatedIngredients[iNum][1] = parseFloat(aggregatedIngredients[iNum][1]) + parseFloat(ingredientsQuery[iQuery].quantity);
            bFound = true;
          }
        }
        if (!bFound) {
          aggregatedIngredients.push([ingredientsQuery[iQuery].name, parseFloat(ingredientsQuery[iQuery].quantity), ingredientsQuery[iQuery].unit]);
          bFound = true;
        }
      }

      let user_id = req.body.user_id;

      res.render("viewShoppingList", { aggregatedIngredients, user_id});
    } else {
      let user_id = req.body.user_id;
      res.render("viewShoppingList", { user_id: user_id, aggregatedIngredients: [], message: "No recipes selected." });
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/viewShoppingList", async (req, res) => {
  try {
    console.log(aggregatedIngredients);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/storeRecipe", async (req, res) => {
  try {
    const { recipe_title, servings, recipe_instructions } = req.body;
    const ingredients = [];

    // Iterate through form data to collect ingredient information
    Object.keys(req.body).forEach((key) => {
      if (key.startsWith("ingredient_name_")) {
        const uniqueCounter = key.split("_")[2]; // Extract uniqueCounter from key
        const ingredient = {
          name: req.body[`ingredient_name_${uniqueCounter}`],
          quantity: req.body[`quantity_${uniqueCounter}`],
          measurement: req.body[`measurement_${uniqueCounter}`],
        };
        ingredients.push(ingredient);
      }
    });

    console.log("Username", req.body.username);

    const queryResult = await knex("users").select("user_id").where("username", req.body.username);
    const user_id = queryResult[0].user_id;
    console.log("User_ID:", user_id);
    console.log("Ingredients:", ingredients);

    // Use Knex transactions to ensure atomicity
    await knex.transaction(async () => {
      // Insert into the recipes table

      // Use 'await' to capture the result of the insert and 'returning'
      await knex("recipes")
        .insert({
          title: req.body.recipe_title,
          user_id: user_id,
          servings: req.body.servings,
          recipe_instructions: recipe_instructions,
        })
        .returning("recipe_id");

      // Insert into the ingredients table and recipe_ingredients junction table
      for (let iCount = 0; iCount < ingredients.length; iCount++) {
        // Use 'await' for the result of the insert and 'returning'
        await knex("ingredients").insert({ name: ingredients[iCount].name }).returning("ingredient_id");

        const ingredientIdPromise = knex("ingredients")
          .select("ingredient_id")
          .where("name", ingredients[iCount].name)
          .then((rows) => rows[0].ingredient_id);
        const ingredientid = await ingredientIdPromise;

        console.log(ingredientid);
        const recipeIdPromise = knex("recipes")
          .select("recipe_id")
          .where("title", "=", req.body.recipe_title)
          .then((rows) => rows[0].recipe_id);

        const recipeId = await recipeIdPromise;
        console.log("Recipe ID:", recipeId);

        // Use 'await' for the result of the insert into 'recipe_ingredients'
        await knex("recipe_ingredients").insert({
          recipe_id: recipeId,
          ingredient_id: ingredientid,
          quantity: ingredients[iCount].quantity,
          unit: ingredients[iCount].measurement,
        });
      }
    });

    res.redirect("/recipeSubmitted/" + user_id);
  } catch (error) {
    console.error("Error processing form data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/logout", (req, res) => {
  res.render("logoutSuccessful");
});

app.get("/accountCreated/:user_id", (req, res) => {
  let user_id = req.params.user_id;
  res.render("accountCreated", {user_id});
});

app.get("/createRecipe", (req, res) => {
  res.render("createRecipe");
});

app.get("/editRecipe/:title", async (req, res) => {
  try {
    const { recipeTitle, username } = req.query;

    const recipeResult = await knex("recipes").select("recipe_id").where("title", req.params.title).first();

    console.log(recipeResult);

    if (!recipeResult) {
      return res.status(404).send("Recipe not found");
    }

    const recipe_id = recipeResult.recipe_id;
    console.log(recipe_id);

    const recipe = await knex("recipes").where("recipe_id", recipe_id).first(); // Assuming you expect only one recipe per recipe_id
    const ingredients = await knex("ingredients")
      .join("recipe_ingredients", "ingredients.ingredient_id", "recipe_ingredients.ingredient_id")
      .select("ingredients.ingredient_id", "ingredients.name", "recipe_ingredients.quantity", "recipe_ingredients.unit")
      .where("recipe_ingredients.recipe_id", recipe_id);

    // Render the view with the fetched data
    res.render("editRecipe", { recipe, ingredients });
  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/updateRecipe", async (req, res) => {
  try {
    const title = req.body.recipe_title;
    const servings = req.body.servings;
    const recipe_instructions = req.body.recipe_instructions;
    const recipe_id = req.body.recipe_id;

    const useridprom = await knex("recipes").where("recipe_id", recipe_id).select("user_id");
    const user_id = useridprom[0].user_id;

    const ingredients = [];
    Object.keys(req.body).forEach((key) => {
      if (key.startsWith("ingredient-name-")) {
        const index = key.split("-")[2];
        ingredients.push({
          name: req.body[`ingredient-name-${index}`],
          quantity: req.body[`quantity-${index}`],
          unit: req.body[`measurement-${index}`],
          ingredient_id: req.body[`ingredient-id-${index}`],
        });
      }
    });

    // Begin a transaction
    await knex.transaction(async (trx) => {
      // Update recipe details
      await trx("recipes").where("recipe_id", recipe_id).update({
        title: title,
        servings: servings,
        recipe_instructions: recipe_instructions,
      });

      // Create array with submitted ingredients
      const submittedIngredientIds = [];
      ingredients.forEach((ingredient) => {
        if (ingredient.ingredient_id) {
          submittedIngredientIds.push(ingredient.ingredient_id);
        }
      });

      // Update each ingredient
      for (const ingredient of ingredients) {
        if (ingredient.ingredient_id) {
          await trx("recipe_ingredients").where("recipe_id", recipe_id).andWhere("ingredient_id", ingredient.ingredient_id).update({
            quantity: ingredient.quantity,
            unit: ingredient.unit,
          });

          await trx("ingredients").where("ingredient_id", ingredient.ingredient_id).update({
            name: ingredient.name,
          });
        } else {
          // Add new ingredient
          const newIngredientResult = await trx("ingredients").insert({ name: ingredient.name }).returning("ingredient_id");
          const newIngredientId = newIngredientResult[0].ingredient_id;
          console.log(typeof newIngredientId, newIngredientId);

          await trx("recipe_ingredients").insert({
            recipe_id: recipe_id,
            ingredient_id: newIngredientId,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
          });
        }

        // Get original ingredient IDs from the form
        let originalIngredientIds = req.body["original-ingredient-ids"] || [];
        if (typeof originalIngredientIds === "string") {
          originalIngredientIds = [originalIngredientIds]; // Ensure it's an array
        }

        // Delete removed ingredients
        for (const id of originalIngredientIds) {
          if (!submittedIngredientIds.includes(id)) {
            // Ingredient removed, perform delete
            await trx("recipe_ingredients").where("recipe_id", recipe_id).andWhere("ingredient_id", id).del();
            await trx("ingredients").where("ingredient_id", id).del();
          }
        }
      }

      await trx.commit();
    });

    res.redirect("/userLanding/" + user_id); // Redirect after successful update
  } catch (error) {
    console.error("Error updating recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/deleteRecipe/:recipe_id", async (req, res) => {
  try {
    const recipe_id = req.params.recipe_id;

    const useridprom = await knex("recipes").where("recipe_id", recipe_id).select("user_id");
    const user_id = useridprom[0].user_id;

    // Begin a transaction for data consistency
    await knex.transaction(async (trx) => {
      // First, select ingredient IDs associated with the recipe
      const ingredientIds = await trx("recipe_ingredients").where("recipe_id", recipe_id).select("ingredient_id");

      // Delete related data from recipe_ingredients junction table
      await trx("recipe_ingredients").where("recipe_id", recipe_id).del();

      //Don't need to delete ingredients from ingredients table because we don't want to delete ingredients
      //Used in other recipes

      // Finally, delete the recipe
      await trx("recipes").where("recipe_id", recipe_id).del();
    });

    res.redirect("/userLanding/" + user_id); // Redirect after successful update
  } catch (error) {
    console.error("Error deleting recipe:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, () => console.log("Express App has started and server is listening!"));
