// Constants for paper size (8.5" x 11") and DPI
const PAPER_WIDTH_INCHES = 8.5;
const PAPER_HEIGHT_INCHES = 11;
const DPI = 300; // High quality for printing
const OVERLAP_INCHES = 0.25; // Quarter inch overlap for alignment
const MARGIN_INCHES = 0.5; // Half inch margin from paper edges

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const imageSize = document.getElementById('imageSize');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const estimatedSegments = document.getElementById('estimatedSegments');
const generateButton = document.getElementById('generateButton');
const downloadSection = document.getElementById('downloadSection');
const downloadAllButton = document.getElementById('downloadAllButton');
const segmentCount = document.getElementById('segmentCount');
const segmentsGrid = document.getElementById('segmentsGrid');

// State
let uploadedImage = null;
let segments = [];
let isProcessing = false;

// Event Listeners
uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleImageUpload);
widthInput.addEventListener('input', updateEstimatedSegments);
heightInput.addEventListener('input', updateEstimatedSegments);
generateButton.addEventListener('click', generateSegments);
downloadAllButton.addEventListener('click', downloadAllSegments);

// Functions
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file.', 'error');
        return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        uploadedImage = img;
        segments = [];
        previewContainer.classList.remove('hidden');
        previewImage.src = img.src;
        imageSize.textContent = `Original size: ${img.width} × ${img.height} pixels`;
        updateEstimatedSegments();
        showToast('Image uploaded successfully!');
    };
    img.onerror = () => {
        showToast('Error loading image. Please try a different file.', 'error');
    };
    img.src = URL.createObjectURL(file);
}

function updateEstimatedSegments() {
    const width = parseFloat(widthInput.value) || 0;
    const height = parseFloat(heightInput.value) || 0;
    
    const cols = Math.ceil((width * DPI) / ((PAPER_WIDTH_INCHES - 1) * DPI));
    const rows = Math.ceil((height * DPI) / ((PAPER_HEIGHT_INCHES - 1) * DPI));
    
    estimatedSegments.textContent = `${cols} × ${rows} = ${cols * rows}`;
}

function drawRegistrationMark(ctx, x, y, size = 20) {
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    // Draw crosshair
    ctx.beginPath();
    ctx.moveTo(x - size / 2, y);
    ctx.lineTo(x + size / 2, y);
    ctx.moveTo(x, y - size / 2);
    ctx.lineTo(x, y + size / 2);
    ctx.stroke();

    // Draw circle around crosshair
    ctx.beginPath();
    ctx.arc(x, y, size / 3, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.restore();
}

async function generateSegments() {
    if (!uploadedImage) {
        showToast('Please upload an image first.', 'error');
        return;
    }

    isProcessing = true;
    generateButton.disabled = true;
    generateButton.innerHTML = '<div class="spinner mx-auto"></div>';

    try {
        // Calculate printable area (excluding margins)
        const printableWidth = (PAPER_WIDTH_INCHES - 2 * MARGIN_INCHES) * DPI;
        const printableHeight = (PAPER_HEIGHT_INCHES - 2 * MARGIN_INCHES) * DPI;

        // Calculate how many segments we need
        const outputWidthPx = parseFloat(widthInput.value) * DPI;
        const outputHeightPx = parseFloat(heightInput.value) * DPI;

        const cols = Math.ceil(outputWidthPx / (printableWidth - OVERLAP_INCHES * DPI));
        const rows = Math.ceil(outputHeightPx / (printableHeight - OVERLAP_INCHES * DPI));

        segments = [];

        // Create a canvas to scale the original image to output size
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = outputWidthPx;
        scaledCanvas.height = outputHeightPx;
        const scaledCtx = scaledCanvas.getContext('2d');

        // Draw scaled image
        scaledCtx.drawImage(uploadedImage, 0, 0, outputWidthPx, outputHeightPx);

        // Generate each segment
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Create segment canvas (full paper size)
                const segmentCanvas = document.createElement('canvas');
                segmentCanvas.width = PAPER_WIDTH_INCHES * DPI;
                segmentCanvas.height = PAPER_HEIGHT_INCHES * DPI;
                const segmentCtx = segmentCanvas.getContext('2d');

                // Fill with white background
                segmentCtx.fillStyle = '#ffffff';
                segmentCtx.fillRect(0, 0, segmentCanvas.width, segmentCanvas.height);

                // Calculate source position with overlap
                const sourceX = col * (printableWidth - OVERLAP_INCHES * DPI);
                const sourceY = row * (printableHeight - OVERLAP_INCHES * DPI);

                // Calculate actual segment size (may be smaller for edge pieces)
                const segmentWidth = Math.min(printableWidth, outputWidthPx - sourceX);
                const segmentHeight = Math.min(printableHeight, outputHeightPx - sourceY);

                // Draw image segment (centered in printable area)
                const destX = MARGIN_INCHES * DPI;
                const destY = MARGIN_INCHES * DPI;

                segmentCtx.drawImage(
                    scaledCanvas,
                    sourceX,
                    sourceY,
                    segmentWidth,
                    segmentHeight,
                    destX,
                    destY,
                    segmentWidth,
                    segmentHeight
                );

                // Add registration marks at corners
                const markSize = 15;
                const markOffset = 10;

                // Top-left
                drawRegistrationMark(segmentCtx, markOffset, markOffset, markSize);
                // Top-right
                drawRegistrationMark(segmentCtx, segmentCanvas.width - markOffset, markOffset, markSize);
                // Bottom-left
                drawRegistrationMark(segmentCtx, markOffset, segmentCanvas.height - markOffset, markSize);
                // Bottom-right
                drawRegistrationMark(
                    segmentCtx,
                    segmentCanvas.width - markOffset,
                    segmentCanvas.height - markOffset,
                    markSize
                );

                // Add segment info text
                segmentCtx.save();
                segmentCtx.fillStyle = '#000000';
                segmentCtx.font = '12px Arial';
                segmentCtx.fillText(`Segment ${row + 1}-${col + 1} (${rows}x${cols})`, 30, 30);
                segmentCtx.fillText(`${widthInput.value}" x ${heightInput.value}" artwork`, 30, 50);
                segmentCtx.restore();

                segments.push({
                    canvas: segmentCanvas,
                    filename: `moler_mosaic_${row + 1}-${col + 1}.png`,
                    row: row + 1,
                    col: col + 1
                });
            }
        }

        // Update UI
        downloadSection.classList.remove('hidden');
        segmentCount.textContent = segments.length;
        renderSegments();

        showToast(`Created ${segments.length} printable segments (${rows}x${cols} grid).`);
    } catch (error) {
        console.error('Error generating segments:', error);
        showToast('Error generating segments. Please try again with a different image.', 'error');
    } finally {
        isProcessing = false;
        generateButton.disabled = false;
        generateButton.textContent = 'Generate Printable Segments';
    }
}

function renderSegments() {
    segmentsGrid.innerHTML = '';
    segments.forEach((segment, index) => {
        const div = document.createElement('div');
        div.className = 'border rounded-lg p-3 text-center';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'w-full border rounded mb-2';
        canvas.width = 120;
        canvas.height = 156; // Maintain 8.5:11 ratio
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(segment.canvas, 0, 0, canvas.width, canvas.height);
        
        const p = document.createElement('p');
        p.className = 'text-xs text-gray-600 mb-2';
        p.textContent = `Segment ${segment.row}-${segment.col}`;
        
        const button = document.createElement('button');
        button.className = 'w-full px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700';
        button.textContent = 'Download';
        button.onclick = () => downloadSegment(segment);
        
        div.appendChild(canvas);
        div.appendChild(p);
        div.appendChild(button);
        segmentsGrid.appendChild(div);
    });
}

function downloadSegment(segment) {
    segment.canvas.toBlob((blob) => {
        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = segment.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }, 'image/png');
}

async function downloadAllSegments() {
    for (const segment of segments) {
        await new Promise((resolve) => {
            segment.canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = segment.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
                setTimeout(resolve, 100); // Small delay between downloads
            }, 'image/png');
        });
    }

    showToast('All segments downloaded successfully!');
} 