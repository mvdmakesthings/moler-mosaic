"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, Download, Grid, Ruler } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface SegmentData {
  canvas: HTMLCanvasElement
  filename: string
  row: number
  col: number
}

export default function ArtworkSegmenter() {
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null)
  const [outputWidth, setOutputWidth] = useState<number>(24)
  const [outputHeight, setOutputHeight] = useState<number>(18)
  const [segments, setSegments] = useState<SegmentData[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Constants for paper size (8.5" x 11") and DPI
  const PAPER_WIDTH_INCHES = 8.5
  const PAPER_HEIGHT_INCHES = 11
  const DPI = 300 // High quality for printing
  const OVERLAP_INCHES = 0.25 // Quarter inch overlap for alignment
  const MARGIN_INCHES = 0.5 // Half inch margin from paper edges

  const handleImageUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image file.",
          variant: "destructive",
        })
        return
      }

      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        setUploadedImage(img)
        setSegments([])
        toast({
          title: "Image uploaded",
          description: "Ready to segment your artwork!",
        })
      }
      img.onerror = () => {
        toast({
          title: "Error loading image",
          description: "Please try a different image file.",
          variant: "destructive",
        })
      }
      img.src = URL.createObjectURL(file)
    },
    [toast],
  )

  const drawRegistrationMark = (ctx: CanvasRenderingContext2D, x: number, y: number, size = 20) => {
    ctx.save()
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    ctx.setLineDash([])

    // Draw crosshair
    ctx.beginPath()
    ctx.moveTo(x - size / 2, y)
    ctx.lineTo(x + size / 2, y)
    ctx.moveTo(x, y - size / 2)
    ctx.lineTo(x, y + size / 2)
    ctx.stroke()

    // Draw circle around crosshair
    ctx.beginPath()
    ctx.arc(x, y, size / 3, 0, 2 * Math.PI)
    ctx.stroke()

    ctx.restore()
  }

  const generateSegments = useCallback(async () => {
    if (!uploadedImage) {
      toast({
        title: "No image uploaded",
        description: "Please upload an image first.",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)

    try {
      // Calculate printable area (excluding margins)
      const printableWidth = (PAPER_WIDTH_INCHES - 2 * MARGIN_INCHES) * DPI
      const printableHeight = (PAPER_HEIGHT_INCHES - 2 * MARGIN_INCHES) * DPI

      // Calculate how many segments we need
      const outputWidthPx = outputWidth * DPI
      const outputHeightPx = outputHeight * DPI

      const cols = Math.ceil(outputWidthPx / (printableWidth - OVERLAP_INCHES * DPI))
      const rows = Math.ceil(outputHeightPx / (printableHeight - OVERLAP_INCHES * DPI))

      const newSegments: SegmentData[] = []

      // Create a canvas to scale the original image to output size
      const scaledCanvas = document.createElement("canvas")
      scaledCanvas.width = outputWidthPx
      scaledCanvas.height = outputHeightPx
      const scaledCtx = scaledCanvas.getContext("2d")!

      // Draw scaled image
      scaledCtx.drawImage(uploadedImage, 0, 0, outputWidthPx, outputHeightPx)

      // Generate each segment
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Create segment canvas (full paper size)
          const segmentCanvas = document.createElement("canvas")
          segmentCanvas.width = PAPER_WIDTH_INCHES * DPI
          segmentCanvas.height = PAPER_HEIGHT_INCHES * DPI
          const segmentCtx = segmentCanvas.getContext("2d")!

          // Fill with white background
          segmentCtx.fillStyle = "#ffffff"
          segmentCtx.fillRect(0, 0, segmentCanvas.width, segmentCanvas.height)

          // Calculate source position with overlap
          const sourceX = col * (printableWidth - OVERLAP_INCHES * DPI)
          const sourceY = row * (printableHeight - OVERLAP_INCHES * DPI)

          // Calculate actual segment size (may be smaller for edge pieces)
          const segmentWidth = Math.min(printableWidth, outputWidthPx - sourceX)
          const segmentHeight = Math.min(printableHeight, outputHeightPx - sourceY)

          // Draw image segment (centered in printable area)
          const destX = MARGIN_INCHES * DPI
          const destY = MARGIN_INCHES * DPI

          segmentCtx.drawImage(
            scaledCanvas,
            sourceX,
            sourceY,
            segmentWidth,
            segmentHeight,
            destX,
            destY,
            segmentWidth,
            segmentHeight,
          )

          // Add registration marks at corners
          const markSize = 15
          const markOffset = 10

          // Top-left
          drawRegistrationMark(segmentCtx, markOffset, markOffset, markSize)

          // Top-right
          drawRegistrationMark(segmentCtx, segmentCanvas.width - markOffset, markOffset, markSize)

          // Bottom-left
          drawRegistrationMark(segmentCtx, markOffset, segmentCanvas.height - markOffset, markSize)

          // Bottom-right
          drawRegistrationMark(
            segmentCtx,
            segmentCanvas.width - markOffset,
            segmentCanvas.height - markOffset,
            markSize,
          )

          // Add segment info text
          segmentCtx.save()
          segmentCtx.fillStyle = "#000000"
          segmentCtx.font = "12px Arial"
          segmentCtx.fillText(`Segment ${row + 1}-${col + 1} (${rows}x${cols})`, 30, 30)
          segmentCtx.fillText(`${outputWidth}" x ${outputHeight}" artwork`, 30, 50)
          segmentCtx.restore()

          newSegments.push({
            canvas: segmentCanvas,
            filename: `artwork_segment_${row + 1}-${col + 1}.png`,
            row: row + 1,
            col: col + 1,
          })
        }
      }

      setSegments(newSegments)
      toast({
        title: "Segments generated!",
        description: `Created ${newSegments.length} printable segments (${rows}x${cols} grid).`,
      })
    } catch (error) {
      console.error("Error generating segments:", error)
      toast({
        title: "Error generating segments",
        description: "Please try again with a different image.",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }, [uploadedImage, outputWidth, outputHeight, toast])

  const downloadSegment = useCallback((segment: SegmentData) => {
    segment.canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = segment.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    }, "image/png")
  }, [])

  const downloadAllSegments = useCallback(async () => {
    for (const segment of segments) {
      await new Promise((resolve) => {
        segment.canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = segment.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
          setTimeout(resolve, 100) // Small delay between downloads
        }, "image/png")
      })
    }

    toast({
      title: "All segments downloaded",
      description: "Print each segment and tape them together using the registration marks for alignment.",
    })
  }, [segments, toast])

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Artwork Segmenter</h1>
          <p className="text-gray-600">Upload artwork and segment it for large-format printing on standard paper</p>
        </div>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Artwork
            </CardTitle>
            <CardDescription>Upload your artwork image to begin segmentation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full h-32 border-dashed"
                >
                  <div className="text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to upload image</p>
                  </div>
                </Button>
              </div>

              {uploadedImage && (
                <div className="text-center">
                  <img
                    src={uploadedImage.src || "/placeholder.svg"}
                    alt="Uploaded artwork"
                    className="max-w-full max-h-48 mx-auto rounded border"
                  />
                  <p className="text-sm text-gray-600 mt-2">
                    Original size: {uploadedImage.width} × {uploadedImage.height} pixels
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Size Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="w-5 h-5" />
              Output Dimensions
            </CardTitle>
            <CardDescription>Specify the final size of your artwork in inches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="width">Width (inches)</Label>
                <Input
                  id="width"
                  type="number"
                  min="1"
                  max="200"
                  step="0.5"
                  value={outputWidth}
                  onChange={(e) => setOutputWidth(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="height">Height (inches)</Label>
                <Input
                  id="height"
                  type="number"
                  min="1"
                  max="200"
                  step="0.5"
                  value={outputHeight}
                  onChange={(e) => setOutputHeight(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Estimated segments:</strong> {Math.ceil((outputWidth * 300) / ((PAPER_WIDTH_INCHES - 1) * 300))}{" "}
                × {Math.ceil((outputHeight * 300) / ((PAPER_HEIGHT_INCHES - 1) * 300))} ={" "}
                {Math.ceil((outputWidth * 300) / ((PAPER_WIDTH_INCHES - 1) * 300)) *
                  Math.ceil((outputHeight * 300) / ((PAPER_HEIGHT_INCHES - 1) * 300))}{" "}
                pages
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Generate Segments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Grid className="w-5 h-5" />
              Generate Segments
            </CardTitle>
            <CardDescription>Create printable segments with registration marks</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={generateSegments} disabled={!uploadedImage || isProcessing} className="w-full">
              {isProcessing ? "Processing..." : "Generate Printable Segments"}
            </Button>
          </CardContent>
        </Card>

        {/* Download Segments */}
        {segments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Download Segments
              </CardTitle>
              <CardDescription>Download individual segments or all at once</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button onClick={downloadAllSegments} className="w-full">
                  Download All Segments ({segments.length} files)
                </Button>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {segments.map((segment, index) => (
                    <div key={index} className="border rounded-lg p-3 text-center">
                      <canvas
                        ref={(canvas) => {
                          if (canvas && segment.canvas) {
                            const ctx = canvas.getContext("2d")!
                            canvas.width = 120
                            canvas.height = 156 // Maintain 8.5:11 ratio
                            ctx.drawImage(segment.canvas, 0, 0, canvas.width, canvas.height)
                          }
                        }}
                        className="w-full border rounded mb-2"
                      />
                      <p className="text-xs text-gray-600 mb-2">
                        Segment {segment.row}-{segment.col}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => downloadSegment(segment)} className="w-full">
                        Download
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                  <h4 className="font-semibold text-yellow-800 mb-2">Assembly Instructions:</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Print each segment on 8.5" × 11" paper at 100% scale (no scaling)</li>
                    <li>• Use the registration marks (crosshairs) at corners for alignment</li>
                    <li>• Start with segment 1-1 (top-left) and work row by row</li>
                    <li>• Overlap segments by ¼" and align registration marks precisely</li>
                    <li>• Use clear tape on the back to join segments</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
