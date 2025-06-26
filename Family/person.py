import uuid
import random
from datetime import datetime, timedelta

# Sample data for names
first_names = ["San", "Si", "Wu", "Liu", "Qi"]
last_names = ["Zhao", "Qian", "Sun", "Li", "Zhou"]
middle_names = ["Marie", "Lee", "Ann", "James", "Lynn"]

# Generate 5 rows of data
rows = []
base_date = datetime(1980, 1, 1)
for i in range(5):
    guid_str = str(uuid.uuid4())
    first = first_names[i]
    last = last_names[i]
    middle = middle_names[i]
    dob = base_date + timedelta(days=random.randint(5000, 15000))
    photo_url = f"https://example.com/photo{i+1}.jpg"
    blob_data = f"blobdata{i+1}"
    sample_data = f"sample data {i+1}"
    row = f'    guid("{guid_str}"), "{first}", "{last}", "{middle}", datetime({dob.strftime("%Y-%m-%d")}), "{photo_url}", "{blob_data}", "{sample_data}"'
    rows.append(row)

# Construct the KQL statement
kql_statement = """.set-or-append Person <|
datatable (
    Id: guid,
    FirstName: string,
    LastName: string,
    MiddleName: string,
    DateOfBirth: datetime,
    PhotoUrl: string,
    BlobData: string,
    SampleData: string
)
[
"""
kql_statement += ",\n".join(rows)
kql_statement += "\n]"

# Output the final KQL
print(kql_statement)
