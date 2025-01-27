
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorAlert = document.getElementById('errorAlert');
const resultSection = document.getElementById('resultSection');
const processSection = document.getElementById('processSection');
const processButton = document.getElementById('processButton');
const imagePreview = document.getElementById('imagePreview');
const resetButton = document.getElementById('resetButton');
const documentsContainer = document.getElementById('documentsContainer');
const documentTemplate = document.getElementById('documentTemplate');
const summarySection = document.getElementById('summarySection');
const summaryContent = document.getElementById('summaryContent');

let uploadedFiles = [];

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('active');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('active');
    });
});

dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length > 0) {
        handleFilesUpload(imageFiles);
    } else {
        showError('Please upload image files.');
    }
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleFilesUpload(files);
    }
});

async function detectDocumentType(file) {
    const base64 = await fileToBase64(file);
    const mimeType = file.type;

    const prompt = `Analyze this document image and determine its exact type (e.g., CFPB Complaint, BBB Complaint, Consumer Letter, Attorney General, Gas Bill, Passport, Driver License, Social Security Card, National ID Card, etc.). 
Return ONLY the document type as a simple string without any additional text or formatting.`;

    const response = await fetch("https://llmfoundry.straive.com/gemini/v1beta/models/gemini-1.5-pro-latest:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: base64.split(',')[1] } }
                ]
            }]
        })
    });

    const result = await response.json();
    const documentType = result.candidates?.[0]?.content?.parts?.[0]?.text.trim();
    return documentType || 'Document';
}

async function handleFilesUpload(files) {

    uploadedFiles = [...uploadedFiles, ...files];

    for (const file of files) {
        const documentElement = documentTemplate.content.cloneNode(true);
        documentsContainer.appendChild(documentElement);
        const currentDocument = documentsContainer.lastElementChild;
        const previewContainer = currentDocument.querySelector('.preview-image');
        const fileType = file.type;

        if (fileType === 'application/pdf') {
            // Create PDF preview
            const objectElement = document.createElement('object');
            objectElement.data = URL.createObjectURL(file);
            objectElement.type = 'application/pdf';
            objectElement.width = '100%';
            objectElement.height = '700px';

            // Replace the img element with the object element
            previewContainer.parentNode.replaceChild(objectElement, previewContainer);
        } else if (fileType.startsWith('image/')) {
            // Handle image preview
            const reader = new FileReader();
            reader.onload = (e) => {
                previewContainer.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            // For unsupported file types, show a placeholder or message
            previewContainer.src = 'path/to/your/placeholder-image.png'; // Add a placeholder image
            console.warn('Unsupported file type:', fileType);
        }

        // Detect document type
        try {
            const documentType = await detectDocumentType(file);
            // Update the card title of the current document's information section
            const currentInfoCardTitle = currentDocument.querySelector('.col-md-6:nth-child(2) .card-title');
            currentInfoCardTitle.textContent = `${documentType} Information`;
        } catch (error) {
            // Update the card title of the current document's information section
            const currentInfoCardTitle = currentDocument.querySelector('.col-md-6:nth-child(2) .card-title');
            currentInfoCardTitle.textContent = 'Document Information';
            console.error('Error detecting document type:', error);
        }
    }

    documentsContainer.style.display = 'block';
    processSection.classList.remove('d-none');
}

processButton.addEventListener('click', async () => {
    if (uploadedFiles.length > 0) {
        loadingSpinner.classList.remove('d-none');
        processSection.classList.add('d-none');
        errorAlert.classList.add('d-none');

        try {
            const results = await Promise.all(uploadedFiles.map(processFile));
            await Promise.all([
                displayAllResults(results),
                generateSummary(results)
            ]);

            loadingSpinner.classList.add('d-none');

        } catch (error) {
            showError(error.message || 'Error processing documents');
        } finally {
            loadingSpinner.classList.add('d-none');
        }
    }
});

async function generateSummary(results) {
    const summaryLoadingSpinner = document.getElementById('summaryLoadingSpinner');
    summaryLoadingSpinner.classList.remove('d-none');
    summaryContent.innerHTML = '';

    try {
        const summaryPrompt = `Analyze the given documents information and provide all the **anomalies** present along with detailed **summary** highlighting key patterns, inconsistencies, or notable observations. Format the response as follows:
1. Each sentence should be on a new line with bullet points
2. Separate different sections with blank lines
3. Provide headings like **Summary** and **Anomalies**
4. Don't consider Document Name for summary and anomalies
Document information:
${JSON.stringify(results, null, 2)}`;

        const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                messages: [{
                    role: "user",
                    content: summaryPrompt
                }],
                model: "gpt-4o-mini",
                temperature: 0,
                max_tokens: 4096
            })
        });

        const result = await response.json();
        let summaryText = result.choices?.[0]?.message?.content;

        if (summaryText) {
            summaryContent.innerHTML = marked.parse(summaryText);
            summarySection.classList.remove('d-none');
        }
    } catch (error) {
        console.error('Summary generation error:', error);
        summaryContent.innerHTML = '<p class="text-danger">Error generating summary</p>';
    } finally {
        summaryLoadingSpinner.classList.add('d-none');
    }
}

function displayAllResults(results) {
    const documentRows = documentsContainer.querySelectorAll('.document-row');
    results.forEach(async (data, index) => {
        const documentRow = documentRows[index];
        const extractedData = documentRow.querySelector('.extracted-data');
        const cardTitle = documentRow.querySelector('.card-title');
        extractedData.innerHTML = '';

        // Create table for the data
        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';

        // Add styles for table cells
        table.style.cssText = `
    border-collapse: collapse;
    width: 100%;
`;

        // Add this style to make all td elements have borders
        table.innerHTML = `
    <style>
        td {
            border: 2px solid #ddd;
            padding: 8px;
        }
    </style>
`;
        extractedData.appendChild(table);

        // Add Document Name
        if (data.Document_Name) {
            const fileNameRow = document.createElement('tr');
            fileNameRow.innerHTML = `
        <td class="fw-bold">Document Name</td>
        <td>${data.Document_Name}</td>
    `;
            table.appendChild(fileNameRow);
        }

        // Add Document Type
        try {
            const file = uploadedFiles.find(f => f.name === data.Document_Name);
            if (file) {
                const documentType = await detectDocumentType(file);
                const documentTypeRow = document.createElement('tr');
                documentTypeRow.innerHTML = `
            <td class="fw-bold">Document Type</td>
            <td>${documentType}</td>
        `;
                table.appendChild(documentTypeRow);
            }
        } catch (error) {
            console.error('Error getting document type:', error);
        }

        // Then add all other fields
        Object.entries(data).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '' && key !== 'Document_Name') {
                const row = document.createElement('tr');
                row.innerHTML = `
            <td class="fw-bold text-capitalize">${key.replace(/_/g, ' ')}</td>
            <td>${value}</td>
        `;
                table.appendChild(row);
            }
        });
    });
}

resetButton.addEventListener('click', () => {
    fileInput.value = '';
    documentsContainer.innerHTML = '';
    processSection.classList.add('d-none');
    errorAlert.classList.add('d-none');
    summarySection.classList.add('d-none');
    uploadedFiles = [];
});

async function processFile(file) {
    try {
        // loadingSpinner.classList.remove('d-none');
        processSection.classList.add('d-none');
        errorAlert.classList.add('d-none');

        const base64 = await fileToBase64(file);
        const mimeType = file.type;

        const prompt = `You are a document analysis expert. Analyze this ID document image and extract the following
information in JSON format:

For passports:
- country
- country_code
- passport_number
- name
- nationality
- date_of_birth
- place_of_birth
- issuing_authority
- id_number
- sex
- date_of_issue
- date_of_expiry

For UAE National ID Cards:
- country
- name
- nationality
- id_number

For other documents:
Extract all visible data points except Document Type.

Important:
1. Convert all text to English if in another language
2. Return ONLY valid JSON
3. Use null for missing fields
4. Format dates as YYYY-MM-DD
5. Clean and standardize all field values`;

        const response = await fetch("https://llmfoundry.straive.com/gemini/v1beta/models/gemini-1.5-pro-latest:generateContent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64.split(',')[1] } }
                    ]
                }]
            })
        });

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error.message || 'API error occurred');
        }

        const extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!extractedText) {
            throw new Error('No data could be extracted from the document');
        }

        let jsonStr = extractedText;
        jsonStr = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
        if (!jsonStr.startsWith('{')) {
            jsonStr = jsonStr.substring(jsonStr.indexOf('{'));
        }
        if (!jsonStr.endsWith('}')) {
            jsonStr = jsonStr.substring(0, jsonStr.lastIndexOf('}') + 1);
        }

        let data;
        try {
            data = JSON.parse(jsonStr);
            // Add filename to the data
            data.Document_Name = file.name;
        } catch (e) {
            throw new Error('Invalid data format received');
        }

        if (Object.keys(data).length === 0) {
            throw new Error('No valid data could be extracted from the document');
        }

        // loadingSpinner.classList.add('d-none');
        return data;

    } catch (error) {
        console.error('Processing error:', error);
        showError(error.message || 'Error processing document. Please try again with a clearer image.');
        loadingSpinner.classList.add('d-none');
        processSection.classList.remove('d-none');
        throw error;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showError(message) {
    errorAlert.textContent = message;
    errorAlert.classList.remove('d-none');
}