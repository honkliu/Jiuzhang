document.addEventListener('DOMContentLoaded', async () => {
    const inputElement = document.getElementById('input');
    const outputElement = document.getElementById('output');
    const submitButton = document.getElementById('submit');

   
    const pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/"
    });

    await pyodide.loadPackage('micropip');
    
/*
    await pyodide.runPythonAsync(`
        import micropip
        await micropip.install('openai', keep_going=True)
    `);
*/


    function formatContent(content) {
        // Function to format bold words
        content = content.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
            return `<span class="bold">${p1}</span>`;
        });

        // Function to format code blocks
        content = content.replace(/```(.*?)```/gs, (match, p1) => {
            const lines = p1.split('\n');
            const formattedLines = lines.map((line, index) => {
                return `<span class="line-number">${index + 1}</span>${line}`;
            }).join('\n');
            return `<div class="code-block">${formattedLines}</div>`;
        });

        // Preserve new lines by wrapping content in <pre> tags
        return `<pre>${content}</pre>`;
    }

    async function callOpenAI() {
        const apiKey = '123'; // Replace with your actual API key
        const prompt = document.getElementById('prompt').value;

        const data = {
            model: 'DeepSeek-R1-Distill-Qwen-32B', // Specify the model you want to use
            prompt: prompt,
            max_tokens: 64000,
            temperature: 0,
           // stream: True,
        };

        try {
            const response = await fetch('http://4.151.212.118:30000/v1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            outputElement.value = formatContent(result.choices[0].text);
        
        } catch (error) {
            console.error('Error:', error);
            outputElement.value = "Error fetching model output.";
        }
    }
    /*submitButton.addEventListener('click', async () => {
        const userInput = inputElement.value;
        if (userInput.trim() === "") {
            alert("Please enter some text.");
            return;
        }

        outputElement.value = "Loading...";

        try {
//            const pyodide = await loadPyodide();
            await pyodide.runPythonAsync(`
                import openai
                
                client = openai.Client(
                    base_url="http://172.191.52.149:30000/v1", api_key="123")

                # Chat completion
                response = client.chat.completions.create(
                    model="DeepSeek-R1-Distill-Qwen-32B",
                    messages=[
                        {"role": "system", "content": "You are a helpful AI assistant"},
                        {"role": "user", "content": "tell me why squre root of 2 is not rational"},
                    ],
                    temperature=0,
                    max_tokens=64000,
                    stream=True
                )
                textcontent = "" 
                for chunk in response:
                    textcontent += chunk.choices[0].delta.content
                
                output = textcontent
            `);

            const content = pyodide.globals.get('output');
            outputElement.value = formatContent(content);
        } catch (error) {
            console.error('Error fetching model output:', error);
            outputElement.value = "Error fetching model output.";
        }
    }); */


});

function formatContent(content) {
    // Function to format bold words
    content = content.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
        return `<span class="bold">${p1}</span>`;
    });

    // Function to format code blocks
    content = content.replace(/```(.*?)```/gs, (match, p1) => {
        const lines = p1.split('\n');
        const formattedLines = lines.map((line, index) => {
            return `<span class="line-number">${index + 1}</span>${line}`;
        }).join('\n');
        return `<div class="code-block">${formattedLines}</div>`;
    });

    // Preserve new lines by wrapping content in <pre> tags
    return `<pre>${content}</pre>`;
}
async function callOpenAI() {
    const apiKey = '123'; // Replace with your actual API key
    const prompt = document.getElementById('prompt').value;
    const outputElement = document.getElementById('output');

    const data = {
        model: 'DeepSeek-R1-Distill-Qwen-32B', // Specify the model you want to use
        
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 64000,
        temperature: 0,
       // stream: True,
    };

    try {
        const response = await fetch('http://4.151.212.118:30000/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        
        content = result.choices[0].message.content;

        content = formatContent(content);

        content = `<pre class="overflow-auto">${content}</pre>`;

        outputElement.innerHTML = content;
       //outputElement.value = formatContent(result.choices[0].message.content);
    
    } catch (error) {
        console.error('Error:', error);
        outputElement.value = "Error fetching model output.";
    }
}