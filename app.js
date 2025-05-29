// Constants for paper size (8.5" x 11") and DPI
const PAPER_WIDTH_INCHES = 8.5;
const PAPER_HEIGHT_INCHES = 11;
const DPI = 300; // High quality for printing
const OVERLAP_INCHES = 0.25; // Quarter inch overlap for alignment
const SAFE_MARGIN_INCHES = 0.25; // Safe margin for printing
const REGISTRATION_MARK_SIZE = 15; // Size of registration marks in pixels
const REGISTRATION_MARK_OFFSET = 5; // Offset from safe margin edge

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const previewOverlay = document.getElementById('previewOverlay');
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
let isAdjustingDimensions = false; // Flag to prevent infinite loops

// Event Listeners
uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleImageUpload);
widthInput.addEventListener('input', () => handleDimensionChange('width'));
heightInput.addEventListener('input', () => handleDimensionChange('height'));
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

function drawSegmentationPreview() {
    if (!uploadedImage) return;

    // Get the actual displayed size of the image
    const displayWidth = previewImage.clientWidth;
    const displayHeight = previewImage.clientHeight;

    // Set canvas size to match the displayed image size
    previewOverlay.width = displayWidth;
    previewOverlay.height = displayHeight;

    const ctx = previewOverlay.getContext('2d');
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Calculate printable area (excluding safe margins)
    const printableWidth = (PAPER_WIDTH_INCHES - 2 * SAFE_MARGIN_INCHES) * DPI;
    const printableHeight = (PAPER_HEIGHT_INCHES - 2 * SAFE_MARGIN_INCHES) * DPI;

    // Calculate how many segments we need
    const outputWidthPx = parseFloat(widthInput.value) * DPI;
    const outputHeightPx = parseFloat(heightInput.value) * DPI;

    // Calculate aspect ratios
    const originalAspectRatio = uploadedImage.width / uploadedImage.height;
    const targetAspectRatio = outputWidthPx / outputHeightPx;

    // Calculate scaled dimensions that maintain aspect ratio
    let scaledWidth, scaledHeight;
    if (originalAspectRatio > targetAspectRatio) {
        scaledWidth = outputWidthPx;
        scaledHeight = outputWidthPx / originalAspectRatio;
    } else {
        scaledHeight = outputHeightPx;
        scaledWidth = outputHeightPx * originalAspectRatio;
    }

    const cols = Math.ceil(outputWidthPx / (printableWidth - OVERLAP_INCHES * DPI));
    const rows = Math.ceil(outputHeightPx / (printableHeight - OVERLAP_INCHES * DPI));

    // Scale factors to convert from output size to display size
    const scaleX = displayWidth / outputWidthPx;
    const scaleY = displayHeight / outputHeightPx;

    // Draw segment boxes
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 2;

    // Draw the scaled image boundary
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.3)';
    ctx.strokeRect(0, 0, scaledWidth * scaleX, scaledHeight * scaleY);

    // Draw segment boxes
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Calculate source position with overlap
            const sourceX = col * (printableWidth - OVERLAP_INCHES * DPI);
            const sourceY = row * (printableHeight - OVERLAP_INCHES * DPI);

            // Calculate actual segment size (may be smaller for edge pieces)
            const segmentWidth = Math.min(printableWidth, outputWidthPx - sourceX);
            const segmentHeight = Math.min(printableHeight, outputHeightPx - sourceY);

            // Check if this segment contains any part of the image
            const segmentRight = sourceX + segmentWidth;
            const segmentBottom = sourceY + segmentHeight;

            // Skip if segment is completely outside the image area
            if (sourceX >= scaledWidth || 
                sourceY >= scaledHeight || 
                segmentRight <= 0 || 
                segmentBottom <= 0) {
                continue;
            }

            // Draw the segment box
            ctx.strokeRect(
                sourceX * scaleX,
                sourceY * scaleY,
                segmentWidth * scaleX,
                segmentHeight * scaleY
            );

            // Add segment number
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.font = '12px Arial';
            ctx.fillText(`${row + 1}-${col + 1}`, sourceX * scaleX + 5, sourceY * scaleY + 15);
        }
    }
}

function handleDimensionChange(changedDimension) {
    if (!uploadedImage || isAdjustingDimensions) return;
    
    isAdjustingDimensions = true;
    
    const originalAspectRatio = uploadedImage.width / uploadedImage.height;
    const width = parseFloat(widthInput.value) || 0;
    const height = parseFloat(heightInput.value) || 0;
    
    if (changedDimension === 'width') {
        // Adjust height based on width
        const newHeight = width / originalAspectRatio;
        heightInput.value = newHeight.toFixed(2);
    } else {
        // Adjust width based on height
        const newWidth = height * originalAspectRatio;
        widthInput.value = newWidth.toFixed(2);
    }
    
    updateEstimatedSegments();
    isAdjustingDimensions = false;
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
        
        // Set initial dimensions based on aspect ratio
        const originalAspectRatio = img.width / img.height;
        const currentWidth = parseFloat(widthInput.value) || 24;
        const currentHeight = parseFloat(heightInput.value) || 18;
        const currentAspectRatio = currentWidth / currentHeight;
        
        isAdjustingDimensions = true;
        if (Math.abs(originalAspectRatio - currentAspectRatio) > 0.01) {
            // If aspect ratios are significantly different, adjust height to match width
            const newHeight = currentWidth / originalAspectRatio;
            heightInput.value = newHeight.toFixed(2);
        }
        isAdjustingDimensions = false;
        
        updateEstimatedSegments();
        // Draw segmentation preview after image loads
        previewImage.onload = drawSegmentationPreview;
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
    
    // Calculate printable area (excluding safe margins)
    const printableWidth = (PAPER_WIDTH_INCHES - 2 * SAFE_MARGIN_INCHES) * DPI;
    const printableHeight = (PAPER_HEIGHT_INCHES - 2 * SAFE_MARGIN_INCHES) * DPI;
    
    // Calculate output dimensions in pixels
    const outputWidthPx = width * DPI;
    const outputHeightPx = height * DPI;
    
    // Calculate number of segments needed
    const cols = Math.ceil(outputWidthPx / (printableWidth - OVERLAP_INCHES * DPI));
    const rows = Math.ceil(outputHeightPx / (printableHeight - OVERLAP_INCHES * DPI));
    
    // Calculate total segments, excluding empty ones
    let totalSegments = 0;
    if (uploadedImage) {
        // Calculate scaled dimensions that maintain aspect ratio
        const originalAspectRatio = uploadedImage.width / uploadedImage.height;
        const targetAspectRatio = outputWidthPx / outputHeightPx;
        
        let scaledWidth, scaledHeight;
        if (originalAspectRatio > targetAspectRatio) {
            scaledWidth = outputWidthPx;
            scaledHeight = outputWidthPx / originalAspectRatio;
        } else {
            scaledHeight = outputHeightPx;
            scaledWidth = outputHeightPx * originalAspectRatio;
        }
        
        // Count only segments that contain image content
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const sourceX = col * (printableWidth - OVERLAP_INCHES * DPI);
                const sourceY = row * (printableHeight - OVERLAP_INCHES * DPI);
                const segmentWidth = Math.min(printableWidth, outputWidthPx - sourceX);
                const segmentHeight = Math.min(printableHeight, outputHeightPx - sourceY);
                
                const segmentRight = sourceX + segmentWidth;
                const segmentBottom = sourceY + segmentHeight;
                
                if (sourceX < scaledWidth && 
                    sourceY < scaledHeight && 
                    segmentRight > 0 && 
                    segmentBottom > 0) {
                    totalSegments++;
                }
            }
        }
    } else {
        totalSegments = cols * rows;
    }
    
    estimatedSegments.textContent = `${cols} × ${rows} = ${totalSegments}`;
    
    // Update segmentation preview when dimensions change
    drawSegmentationPreview();
}

function drawRegistrationMark(ctx, x, y, size = REGISTRATION_MARK_SIZE) {
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
        // Calculate printable area (excluding safe margins)
        const printableWidth = (PAPER_WIDTH_INCHES - 2 * SAFE_MARGIN_INCHES) * DPI;
        const printableHeight = (PAPER_HEIGHT_INCHES - 2 * SAFE_MARGIN_INCHES) * DPI;

        // Calculate how many segments we need
        const outputWidthPx = parseFloat(widthInput.value) * DPI;
        const outputHeightPx = parseFloat(heightInput.value) * DPI;

        // Calculate aspect ratios
        const originalAspectRatio = uploadedImage.width / uploadedImage.height;
        const targetAspectRatio = outputWidthPx / outputHeightPx;

        // Calculate scaled dimensions that maintain aspect ratio
        let scaledWidth, scaledHeight;
        if (originalAspectRatio > targetAspectRatio) {
            scaledWidth = outputWidthPx;
            scaledHeight = outputWidthPx / originalAspectRatio;
        } else {
            scaledHeight = outputHeightPx;
            scaledWidth = outputHeightPx * originalAspectRatio;
        }

        const cols = Math.ceil(outputWidthPx / (printableWidth - OVERLAP_INCHES * DPI));
        const rows = Math.ceil(outputHeightPx / (printableHeight - OVERLAP_INCHES * DPI));

        segments = [];

        // Create a canvas to scale the original image to output size
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = outputWidthPx;
        scaledCanvas.height = outputHeightPx;
        const scaledCtx = scaledCanvas.getContext('2d');

        // Fill with white background
        scaledCtx.fillStyle = '#ffffff';
        scaledCtx.fillRect(0, 0, outputWidthPx, outputHeightPx);

        // Draw scaled image at top-left
        scaledCtx.drawImage(uploadedImage, 0, 0, scaledWidth, scaledHeight);

        // Generate each segment
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Calculate source position with overlap
                const sourceX = col * (printableWidth - OVERLAP_INCHES * DPI);
                const sourceY = row * (printableHeight - OVERLAP_INCHES * DPI);

                // Calculate actual segment size (may be smaller for edge pieces)
                const segmentWidth = Math.min(printableWidth, outputWidthPx - sourceX);
                const segmentHeight = Math.min(printableHeight, outputHeightPx - sourceY);

                // Check if this segment contains any part of the image
                const segmentRight = sourceX + segmentWidth;
                const segmentBottom = sourceY + segmentHeight;

                // Skip if segment is completely outside the image area
                if (sourceX >= scaledWidth || 
                    sourceY >= scaledHeight || 
                    segmentRight <= 0 || 
                    segmentBottom <= 0) {
                    continue;
                }

                // Create segment canvas (full paper size)
                const segmentCanvas = document.createElement('canvas');
                segmentCanvas.width = PAPER_WIDTH_INCHES * DPI;
                segmentCanvas.height = PAPER_HEIGHT_INCHES * DPI;
                const segmentCtx = segmentCanvas.getContext('2d');

                // Fill with white background
                segmentCtx.fillStyle = '#ffffff';
                segmentCtx.fillRect(0, 0, segmentCanvas.width, segmentCanvas.height);

                // Draw image segment (centered in printable area)
                const destX = SAFE_MARGIN_INCHES * DPI;
                const destY = SAFE_MARGIN_INCHES * DPI;

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

                // Add registration marks at corners (within safe area)
                const markOffset = SAFE_MARGIN_INCHES * DPI + REGISTRATION_MARK_OFFSET;

                // Top-left
                drawRegistrationMark(segmentCtx, markOffset, markOffset);
                // Top-right
                drawRegistrationMark(segmentCtx, segmentCanvas.width - markOffset, markOffset);
                // Bottom-left
                drawRegistrationMark(segmentCtx, markOffset, segmentCanvas.height - markOffset);
                // Bottom-right
                drawRegistrationMark(
                    segmentCtx,
                    segmentCanvas.width - markOffset,
                    segmentCanvas.height - markOffset
                );

                // Add segment info text (within safe area)
                segmentCtx.save();
                segmentCtx.fillStyle = '#000000';
                segmentCtx.font = '12px Arial';
                segmentCtx.fillText(`Segment ${row + 1}-${col + 1} (${rows}x${cols})`, markOffset + 5, markOffset + 15);
                segmentCtx.fillText(`${widthInput.value}" x ${heightInput.value}" artwork`, markOffset + 5, markOffset + 35);
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