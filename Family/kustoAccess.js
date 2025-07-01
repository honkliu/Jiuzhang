const { InteractiveBrowserCredentialNodeOptions } = require('@azure/identity');
const { Client, KustoConnectionStringBuilder } = require("azure-kusto-data");
const crypto = require('crypto');

// Configuration - Replace with your values
const CLUSTER_URL = "https://kvc-nnjzc1axsetxffuhdh.southcentralus.kusto.windows.net/";
const DATABASE_NAME = "Family";

// GUID Generation and Data Processing (Same as before)
function nameToGuid(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
    }
    return crypto.randomUUID();
    //return `xxxxxxxx-xxxx-4xxx-xxxx-xxxx${Math.abs(hash).toString(16).padStart(12, '0').substr(-12)}`;
}

function processFamily(person, parentGuid = null, output = { persons: [], relations: [] }) {
    const guid = nameToGuid(person.name);
    output.persons.push({
        Identity: guid,
        FirstName: person.name,
        LastName: "",
        OtherName: "",
        BirthDate: null,
        Photo: "",
        BlobData: "",
        'data': "",
        LeaveDate: null
    });
    
    if (parentGuid) {
        output.relations.push({
            relationship_id: "Parent or Child",
            from_person: parentGuid,
            to_person: guid,
            relation_type: "parent",
            start_date: null,
            end_date: null
        });
    }
//    console.log("Person: ", person);
    (person.children || []).forEach(child => 
        processFamily(child, guid, output)
    );
    return output;
}

// Sample Data
const data = {
    name: "李周氏", age: 102,
    children: [
        {
            name: "李国栋", age: 80,
            children: [
                {
                    name: "李志远", age: 58,
                    children: [
                        { name: "李正豪", age: 36, children: [{ name: "李朝阳", age: 12 }] },
                        { name: "李正轩", age: 35, children: [{ name: "李晓阳", age: 11 }] },
                        { name: "李正宇", age: 33, children: [{ name: "李文博", age: 9 }, { name: "李文昊", age: 6 }, { name: "李文轩", age: 4 }] },
                        { name: "李正航", age: 32, children: [{ name: "李星辰", age: 8 }] },
                        { name: "李婉婷", age: 30, children: [{ name: "王思远", age: 7 }] }  // 嫁入王家
                    ]
                },
                {
                    name: "李志宏", age: 56,
                    children: [
                        { name: "李正阳", age: 34, children: [{ name: "李泽宇", age: 10 }] },
                        { name: "李正明", age: 32, children: [{ name: "李雨萱", age: 8 }] },
                        { name: "李正清", age: 30, children: [{ name: "李欣怡", age: 5 }] },
                        { name: "李正华", age: 28, children: [{ name: "李昊然", age: 3 }] },
                        { name: "李玉玲", age: 26, children: [] }
                    ]
                },
                {
                    name: "李志伟", age: 54,
                    children: [
                        { name: "李浩然", age: 29 },
                        { name: "李梦瑶", age: 27, children: [{ name: "张子涵", age: 2 }] }  // 嫁入张家
                    ]
                },
                {
                    name: "李志强", age: 51,
                    children: [
                        { name: "李正飞", age: 28, children: [{ name: "李梓涵", age: 4 }] },
                        { name: "李佳琪", age: 25, children: [{ name: "陈宇航", age: 1 }] }  // 嫁入陈家
                    ]
                }
            ]
        }
    ]
};

// Generate Kusto Data
const { persons, relations } = processFamily(data);


// Function to escape Kusto string values
const kustoEscape = (val) => 
    typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : 
    val === null ? "null" : 
    val;

// Main Execution Function
async function ingestFamilyTree() {

    

    const kcsb = KustoConnectionStringBuilder.withUserPrompt(CLUSTER_URL);
    const client = new Client(kcsb);

    
    // Create persons ingestion command
    const personCommand = `.ingest inline into table JiuzhangPerson <|\n` +
        persons.map(p => Object.values(p).map(kustoEscape).join(",")).join("\n");
    
    // Create relations ingestion command
    const relationCommand = `.ingest inline into table JiuzhangRelation <|\n` +
        relations.map(r => Object.values(r).map(kustoEscape).join(",")).join("\n");

    // Execute commands
    try {
        // Execute person ingestion
        const personResult = await client.execute(DATABASE_NAME, personCommand);
        console.log("Person Command:", personCommand);
        console.log("Persons ingested:", personResult.primaryResults[0].toString());
        
        // Execute relation ingestion
       const relationResult = await client.execute(DATABASE_NAME, relationCommand);
       console.log("Relations Command:", relationCommand);
        //console.log("Relations ingested:", relationResult.primaryResults[0].toString());
        
        console.log("✅ Family tree data successfully ingested!");
    } catch (error) {
        console.error("Ingestion failed:", error);
    }
}

// Run the ingestion
ingestFamilyTree();