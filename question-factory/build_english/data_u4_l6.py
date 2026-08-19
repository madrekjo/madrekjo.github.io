ITEMS = [
    # --- Recipe Writing Order (8 items) ---
    (
        "What is the first part of a well-written recipe?",
        {"A": "Cooking instructions", "B": "Title", "C": "Serving suggestion", "D": "List of ingredients"},
        "B", "easy", 47, "L6",
        ["Identify the question topic: first part of a recipe"],
        "Title comes first in a recipe.",
        "The title is the first thing a reader sees in a recipe, followed by ingredients and instructions."
    ),
    (
        "Which section comes immediately after the title in a recipe?",
        {"A": "Serving suggestion", "B": "Cooking instructions", "C": "List of ingredients", "D": "Introduction"},
        "C", "easy", 47, "L6",
        ["Identify the question topic: second part of a recipe"],
        "Ingredients come after the title.",
        "After the title, the recipe lists all the ingredients needed before moving on to instructions."
    ),
    (
        "What is the correct order of a recipe's main sections?",
        {"A": "Instructions, title, ingredients", "B": "Ingredients, instructions, serving suggestion", "C": "Title, instructions, ingredients", "D": "Serving suggestion, title, ingredients"},
        "B", "medium", 47, "L6",
        ["Identify the correct recipe structure order"],
        "Ingredients, instructions, serving suggestion is correct.",
        "A recipe follows the order: title, ingredients, cooking instructions, and finally serving suggestion."
    ),
    (
        "The serving suggestion in a recipe tells the reader:",
        {"A": "What temperature to cook at", "B": "How many people the dish serves", "C": "How to present and serve the dish", "D": "What tools are needed"},
        "C", "medium", 47, "L6",
        ["Identify the question topic: purpose of serving suggestion"],
        "Serving suggestion describes presentation.",
        "The serving suggestion explains how to plate and present the finished dish."
    ),
    (
        "Which part of the recipe contains step-by-step directions?",
        {"A": "Title", "B": "List of ingredients", "C": "Cooking instructions", "D": "Serving suggestion"},
        "C", "easy", 47, "L6",
        ["Identify the question topic: location of directions"],
        "Cooking instructions contain step-by-step directions.",
        "The cooking instructions section provides the detailed step-by-step method."
    ),
    (
        "What should be listed in the ingredients section?",
        {"A": "Personal opinions about the dish", "B": "All food items and quantities needed", "C": "A story about the recipe", "D": "Tips for advanced cooks"},
        "B", "easy", 47, "L6",
        ["Identify the question topic: contents of ingredients section"],
        "Ingredients section lists food items and quantities.",
        "The ingredients section includes every food item and exact quantity required for the recipe."
    ),
    (
        "Why is it important to follow the correct order when writing a recipe?",
        {"A": "To make the recipe longer", "B": "To confuse the reader", "C": "So the reader can follow it easily and prepare the dish", "D": "To add more ingredients"},
        "C", "medium", 47, "L6",
        ["Identify the question topic: importance of recipe order"],
        "Correct order helps the reader follow the recipe.",
        "Following the correct order ensures the reader can prepare the dish step by step without confusion."
    ),
    (
        "A recipe's title should clearly describe:",
        {"A": "The author's biography", "B": "The name of the dish being prepared", "C": "The history of the dish", "D": "The country of origin only"},
        "B", "easy", 47, "L6",
        ["Identify the question topic: what a recipe title shows"],
        "The title describes the name of the dish.",
        "The recipe title clearly states what dish is being prepared so the reader knows what they are making."
    ),

    # --- Sequential Connectors for Recipes (8 items) ---
    (
        "Which connector is used to describe the very first step in a recipe?",
        {"A": "Finally", "B": "Then", "C": "First", "D": "After that"},
        "C", "easy", 47, "L6",
        ["Identify the question topic: first step connector"],
        "First is used for the initial step.",
        "First introduces the beginning of a sequence of steps in a recipe."
    ),
    (
        "Fill in the blank: '___, mix the flour and sugar in a large bowl.'",
        {"A": "Finally", "B": "However", "C": "First", "D": "Moreover"},
        "C", "easy", 47, "L6",
        ["Identify the question topic: sequence connector for first step"],
        "First is the correct connector for the opening step.",
        "When describing the opening step, 'first' is the appropriate sequential connector."
    ),
    (
        "Which connector shows the next step after 'First'?",
        {"A": "However", "B": "Then", "C": "But", "D": "Although"},
        "B", "easy", 47, "L6",
        ["Identify the question topic: connector after first"],
        "Then is the correct connector for the next step.",
        "Then is a sequential connector used to introduce the step that follows the first one."
    ),
    (
        "Fill in the blank: 'First, preheat the oven. ___, add the eggs to the mixture.'",
        {"A": "However", "B": "After that", "C": "Then", "D": "On the other hand"},
        "C", "medium", 47, "L6",
        ["Identify the question topic: sequential connector in context"],
        "Then correctly connects two consecutive steps.",
        "Then is used to move from one step to the immediate next step in a sequence."
    ),
    (
        "Which connector is best for the last step in a recipe?",
        {"A": "First", "B": "Next", "C": "Then", "D": "Finally"},
        "D", "easy", 47, "L6",
        ["Identify the question topic: last step connector"],
        "Finally signals the last step.",
        "Finally is used to indicate the concluding step in a sequence of instructions."
    ),
    (
        "Fill in the blank: '___, after the chicken is golden brown, serve it with rice.'",
        {"A": "Next", "B": "After that", "C": "First", "D": "However"},
        "B", "medium", 47, "L6",
        ["Identify the question topic: connector for step following another"],
        "After that connects steps in sequence.",
        "After that is used to describe a step that comes after a previous one has been completed."
    ),
    (
        "Which of these is NOT a sequential connector used in recipes?",
        {"A": "First", "B": "Moreover", "C": "Next", "D": "After that"},
        "B", "medium", 47, "L6",
        ["Identify the question topic: which word is not sequential"],
        "Moreover is not a sequential connector.",
        "Moreover is an addition connector, not a sequential one; it adds information rather than showing order."
    ),
    (
        "Put the connectors in the correct order for a recipe: first, then, next, after that, finally.",
        {"A": "first → after that → then → next → finally", "B": "first → next → then → after that → finally", "C": "first → then → next → after that → finally", "D": "first → then → after that → next → finally"},
        "C", "hard", 47, "L6",
        ["Identify the question topic: ordering sequential connectors"],
        "The correct order is first → then → next → after that → finally.",
        "These connectors follow a logical order from beginning to end of a recipe instruction."
    ),

    # --- Food Review Adjectives (8 items) ---
    (
        "What does 'mouth-watering' describe?",
        {"A": "A dish that looks very appetizing", "B": "A dish that is too salty", "C": "A dish that is bland", "D": "A dish that is cold"},
        "A", "easy", 48, "L6",
        ["Identify the question topic: meaning of mouth-watering"],
        "Mouth-watering means very appetizing.",
        "Mouth-watering is an adjective used to describe food that looks so delicious it makes you want to eat it."
    ),
    (
        "Which adjective means 'so tasty you can't stop eating'?",
        {"A": "Bland", "B": "Irresistible", "C": "Sour", "D": "Raw"},
        "B", "easy", 48, "L6",
        ["Identify the question topic: adjective meaning"],
        "Irresistible means impossible to resist.",
        "Irresistible describes food so delicious that you cannot stop eating it."
    ),
    (
        "What does 'finger-licking' describe?",
        {"A": "Food that is too hot to touch", "B": "Food so delicious you lick your fingers after eating", "C": "Food that is messy and unhealthy", "D": "Food that is served without utensils"},
        "B", "easy", 48, "L6",
        ["Identify the question topic: meaning of finger-licking"],
        "Finger-licking means very tasty.",
        "Finger-licking is an adjective meaning the food is so enjoyable you lick your fingers clean."
    ),
    (
        "Which word best describes a dish with rich and deep flavors?",
        {"A": "Bland", "B": "Mouth-watering", "C": "Flavorful", "D": "Tasteless"},
        "C", "medium", 48, "L6",
        ["Identify the question topic: adjective for rich flavors"],
        "Flavorful describes food with rich flavors.",
        "Flavorful is an adjective meaning the food has strong, rich, and pleasant flavors."
    ),
    (
        "What does 'crispy' describe when reviewing food?",
        {"A": "Food that is soft and mushy", "B": "Food with a firm, crunchy texture", "C": "Food that is cold", "D": "Food that is spicy"},
        "B", "easy", 48, "L6",
        ["Identify the question topic: meaning of crispy"],
        "Crispy means firm and crunchy.",
        "Crispy describes food that has a satisfying crunch when you bite into it."
    ),
    (
        "Which adjective is used for food that has no strong taste?",
        {"A": "Mouth-watering", "B": "Delicious", "C": "Bland", "D": "Irresistible"},
        "C", "easy", 48, "L6",
        ["Identify the question topic: adjective for tasteless food"],
        "Bland means lacking flavor.",
        "Bland is a negative adjective describing food that lacks taste or flavor."
    ),
    (
        "Fill in the blank: 'The pasta was absolutely ___. I couldn't stop eating it.'",
        {"A": "Bland", "B": "Irresistible", "C": "Tasteless", "D": "Raw"},
        "B", "medium", 48, "L6",
        ["Identify the question topic: adjective in context"],
        "Irresistible fits because the reviewer could not stop eating.",
        "Irresistible fits the context because it means the food was so good the reviewer kept eating."
    ),
    (
        "Which word is the BEST adjective to use in a positive food review?",
        {"A": "Tasteless", "B": "Bland", "C": "Decent", "D": "Mouth-watering"},
        "D", "medium", 48, "L6",
        ["Identify the question topic: best positive food adjective"],
        "Mouth-watering is the strongest positive adjective.",
        "Mouth-watering is the most enthusiastic and positive adjective among the choices for a food review."
    ),

    # --- Review Connectors (8 items) ---
    (
        "Which connector is used to show contrast in a food review?",
        {"A": "Moreover", "B": "In addition", "C": "However", "D": "Also"},
        "C", "easy", 48, "L6",
        ["Identify the question topic: contrast connector"],
        "However shows contrast.",
        "However is used to introduce a contrasting point or an opposing idea in a review."
    ),
    (
        "Fill in the blank: 'The food was excellent.___, the service was slow.'",
        {"A": "Moreover", "B": "However", "C": "Also", "D": "Furthermore"},
        "B", "medium", 48, "L6",
        ["Identify the question topic: contrast connector in context"],
        "However shows the contrast between food and service.",
        "However connects two contrasting ideas: excellent food but slow service."
    ),
    (
        "Which connector is used to present the opposite side of an argument?",
        {"A": "Moreover", "B": "In addition", "C": "However", "D": "On the other hand"},
        "D", "medium", 48, "L6",
        ["Identify the question topic: opposite-side connector"],
        "On the other hand presents the opposite side.",
        "On the other hand is used to introduce an opposing or contrasting perspective."
    ),
    (
        "Fill in the blank: 'The dessert was sweet and creamy. ___, it was not too heavy.'",
        {"A": "On the other hand", "B": "However", "C": "In addition", "D": "But"},
        "C", "medium", 48, "L6",
        ["Identify the question topic: addition connector in context"],
        "In addition adds another positive point.",
        "In addition is used to add another related point or detail."
    ),
    (
        "Which connector means 'also' or 'besides'?",
        {"A": "However", "B": "But", "C": "Moreover", "D": "On the other hand"},
        "C", "easy", 48, "L6",
        ["Identify the question topic: connector meaning"],
        "Moreover means also or besides.",
        "Moreover is used to add extra information to support or expand on a previous point."
    ),
    (
        "Fill in the blank: 'The restaurant has great ambiance. ___, the prices are very reasonable.'",
        {"A": "However", "B": "On the other hand", "C": "Moreover", "D": "But"},
        "C", "medium", 48, "L6",
        ["Identify the question topic: addition connector in context"],
        "Moreover adds another positive aspect.",
        "Moreover is used here to add a positive point that supports the overall good review."
    ),
    (
        "Which sentence uses a contrast connector correctly?",
        {"A": "The soup was salty. Moreover, it was too cold.", "B": "The soup was salty. However, it was well-seasoned.", "C": "The soup was salty. In addition, it was too cold.", "D": "The soup was salty. Also, it was too cold."},
        "B", "hard", 48, "L6",
        ["Identify the question topic: correct use of contrast connector"],
        "However correctly introduces a contrasting point.",
        "However is used correctly when the second clause contrasts with or opposes the first clause."
    ),
    (
        "Fill in the blank: 'The main course was delicious. ___, the side dishes were equally impressive.'",
        {"A": "However", "B": "On the other hand", "C": "But", "D": "In addition"},
        "D", "medium", 48, "L6",
        ["Identify the question topic: addition connector for similar point"],
        "In addition connects a similar positive point.",
        "In addition is used to add another positive point that reinforces the previous statement."
    ),

    # --- Food Review Phrases (5 items) ---
    (
        "What does 'a hidden gem' mean when describing a restaurant?",
        {"A": "A restaurant that is very famous", "B": "A little-known restaurant that is surprisingly good", "C": "A restaurant with poor decoration", "D": "A restaurant that is expensive"},
        "B", "easy", 48, "L6",
        ["Identify the question topic: meaning of hidden gem"],
        "A hidden gem is an undiscovered, excellent place.",
        "A hidden gem refers to a little-known restaurant or place that offers surprisingly great food."
    ),
    (
        "Which phrase means 'a dish that everyone must try'?",
        {"A": "A waste of money", "B": "A must-try", "C": "A total disaster", "D": "A ordinary meal"},
        "B", "easy", 48, "L6",
        ["Identify the question topic: must-try phrase"],
        "A must-try means essential to experience.",
        "A must-try is used to strongly recommend a dish that is definitely worth ordering."
    ),
    (
        "What does 'a culinary delight' mean?",
        {"A": "A bad cooking experience", "B": "A simple and boring dish", "C": "A wonderful and enjoyable food experience", "D": "A dish that is too spicy"},
        "C", "easy", 48, "L6",
        ["Identify the question topic: meaning of culinary delight"],
        "A culinary delight is a wonderful food experience.",
        "A culinary delight describes an outstanding and enjoyable experience with food."
    ),
    (
        "Fill in the blank: 'This tiny cafe is a real ___. The food is amazing and the prices are low.'",
        {"A": "culinary disaster", "B": "hidden gem", "C": "waste of time", "D": "food nightmare"},
        "B", "medium", 48, "L6",
        ["Identify the question topic: review phrase in context"],
        "Hidden gem fits the context of a small, excellent place.",
        "Hidden gem fits because the description mentions a tiny cafe with amazing food and low prices."
    ),
    (
        "Which phrase would you use to strongly recommend a dish in a review?",
        {"A": "It was okay.", "B": "I would not recommend it.", "C": "This is a must-try dish!", "D": "It was not bad."},
        "C", "easy", 48, "L6",
        ["Identify the question topic: strongest recommendation phrase"],
        "This is a must-try dish is the strongest recommendation.",
        "This is a must-try dish is an enthusiastic phrase used to strongly recommend a dish to readers."
    ),

    # --- Writing Structure: Opinion and Conclusion Phrases (3 items) ---
    (
        "Which phrase is used to give an opinion in a food review?",
        {"A": "In conclusion", "B": "I believe that this restaurant deserves five stars", "C": "First, we ordered the soup", "D": "The restaurant opens at 6 PM"},
        "B", "easy", 48, "L6",
        ["Identify the question topic: opinion phrase in review"],
        "I believe that this restaurant deserves five stars is an opinion phrase.",
        "Opinion phrases express the reviewer's personal view about the food or restaurant."
    ),
    (
        "Which phrase is best for concluding a food review?",
        {"A": "First, we sat down", "B": "Then, we ordered drinks", "C": "In conclusion, I highly recommend this restaurant", "D": "Moreover, the bread was warm"},
        "C", "medium", 48, "L6",
        ["Identify the question topic: conclusion phrase"],
        "In conclusion introduces the final summary.",
        "In conclusion is used to wrap up a review and give a final recommendation or verdict."
    ),
    (
        "What is the correct structure of a well-written food review?",
        {"A": "Conclusion → Opinion → Details", "B": "Opinion → Details → Conclusion", "C": "Details → Conclusion → Opinion", "D": "Title → Biography → Opinion"},
        "B", "hard", 48, "L6",
        ["Identify the question topic: food review structure"],
        "Opinion → Details → Conclusion is the correct order.",
        "A good food review starts with an overall opinion, provides supporting details, and ends with a conclusion."
    ),
]
