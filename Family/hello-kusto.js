const { Client, KustoConnectionStringBuilder } = require("azure-kusto-data");

async function main() {
    const clusterUrl = "https://kvc-nnjzc1axsetxffuhdh.southcentralus.kusto.windows.net";
    const database = "Family";
    const tableName = "Persons";

    const kcsb = KustoConnectionStringBuilder.withUserPrompt(clusterUrl);
    const client = new Client(kcsb);


    const query = `${tableName}`;
    
    const response = await client.execute(database, query);

    console.dir(response, { depth: null });

        // Process results
    const table = response.primaryResults[0];
    console.log(`\n✅ Retrieved ${table._rows.length} records from ${tableName} table:`);

    // Print column headers
    console.log("\nColumns:", table.columns.map(col => col.name).join(", "));

    // Print first 5 rows
    console.log("\nFirst 5 rows:");
    for (let i = 0; i < Math.min(5, table._rows.length); i++) {
        console.log(table._rows[i]);
    }

    // Show total count
    console.log(`\nTotal records retrieved: ${table._rows.length}`);
}

main();
