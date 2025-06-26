

function renderTheTree(familyTree, genFrom = 0, genDepth = 5, childFrom = 0, childWidth = 10) {
    const tree = document.getElementById("tree");
    tree.innerHTML = ""; // Clear previous content

    /* 
    * Here I want to generate the UI for the tree automatically, 
    * 1. in a reverse order, to generate the tree from the bottom up, that is, go through each person in the 
    * children array, create the UI for each child. If chidren share the same parent, then they should be connected 
    * with a horizontal line on top. 
    * 2. After all children are rendered, then render the parent, and connect the parent with a vertical line to each child.
    * 3. Repeat the process for each parent, going up the tree.
    * 4. note: the data structure will be {Name, id, parentID, Sex,Generation, NumberInGeneration} 
    */
    const generations = familyTree.filter(person 
        => person.Generation === genFrom 
        && person.NumberInGeneration >= childFrom);

    generations.forEach((person, index) => {
        const personDiv = document.createElement("div");
        personDiv.className = "person";
        personDiv.id = `person-${person.id}`;
        personDiv.style.left = `${index * childWidth}px`;
        personDiv.innerHTML = `<span>${person.Name}</span>`;
        
        // Add horizontal line if not the last child
        if (index < generations.length - 1) {
            const line = document.createElement("div");
            line.className = "line horizontal";
            line.style.width = `${childWidth}px`;
            personDiv.appendChild(line);
        }

        tree.appendChild(personDiv);

        // Render parent if exists
        if (person.parentID) {
            const parent = familyTree.find(p => p.id === person.parentID);
            if (parent && parent.Generation === genFrom - 1) {
                const parentDiv = document.createElement("div");
                parentDiv.className = "parent";
                parentDiv.id = `parent-${parent.id}`;
                parentDiv.style.left = `${index * childWidth}px`;
                parentDiv.innerHTML = `<span>${parent.Name}</span>`;
                
                // Add vertical line to each child
                const verticalLine = document.createElement("div");
                verticalLine.className = "line vertical";
                verticalLine.style.height = "50px"; // Adjust height as needed
                parentDiv.appendChild(verticalLine);
                
                tree.appendChild(parentDiv);
            }
        }
    }