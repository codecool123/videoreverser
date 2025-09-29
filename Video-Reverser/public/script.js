document.addEventListener("DOMContentLoaded", () => {
    // --- Loading Spinner Fade Out ---
    const loadingSpinner = document.getElementById("loading-spinner");

    // Fade out the loading spinner after a short delay to ensure everything is loaded
    setTimeout(() => {
        loadingSpinner.classList.add("fade-out");
        // Remove the element from DOM after animation completes
        setTimeout(() => {
            loadingSpinner.remove();
        }, 800);
    }, 500); // Adjust delay as needed

    // --- Dark Mode Toggle ---
    const themeToggle = document.getElementById("checkbox");
    const currentTheme = localStorage.getItem("theme");

    if (currentTheme) {
        // User has a saved preference
        document.body.classList.add(currentTheme);
        if (currentTheme === "dark-mode") {
            themeToggle.checked = true;
        }
    } else {
        // First visit - detect device theme preference
        const prefersDarkMode =
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;

        if (prefersDarkMode) {
            document.body.classList.add("dark-mode");
            themeToggle.checked = true;
            localStorage.setItem("theme", "dark-mode");
        } else {
            localStorage.setItem("theme", "light-mode");
        }
    }

    themeToggle.addEventListener("change", () => {
        if (themeToggle.checked) {
            document.body.classList.add("dark-mode");
            localStorage.setItem("theme", "dark-mode");
        } else {
            document.body.classList.remove("dark-mode");
            localStorage.setItem("theme", "light-mode"); // Or remove item if light is default
        }
    });

    // --- DOM Elements ---
    const uploadSection = document.getElementById("upload-section");
    const recordSection = document.getElementById("record-section");
    const resultSection = document.getElementById("result-section");

    const showUploadModeBtn = document.getElementById("show-upload-mode-btn");
    const showRecordModeBtn = document.getElementById("show-record-mode-btn");

    // Upload Mode Elements
    const dropArea = document.getElementById("drop-area");
    const videoInput = document.getElementById("video-input");
    const browseBtn = document.getElementById("browse-btn");
    const selectedFileName = document.getElementById("selected-file-name");
    const uploadProgressBar = document.getElementById("upload-progress-bar");
    const uploadProgressContainer = document.getElementById(
        "upload-progress-container",
    );
    const uploadStatusMessage = document.getElementById(
        "upload-status-message",
    );
    const uploadForm = document.getElementById("upload-form");

    // Record Mode Elements
    const liveCameraFeed = document.getElementById("live-camera-feed");
    const recordingStatus = document.getElementById("recording-status");
    const startRecordingBtn = document.getElementById("start-recording-btn");
    const stopRecordingBtn = document.getElementById("stop-recording-btn");
    const uploadRecordedBtn = document.getElementById("upload-recorded-btn");
    const retakeRecordedBtn = document.getElementById("retake-recorded-btn");
    const recordProgressBar = document.getElementById("record-progress-bar");
    const recordProgressContainer = document.getElementById(
        "record-progress-container",
    );
    const recordUploadStatusMessage = document.getElementById(
        "record-upload-status-message",
    );

    // Result Section Elements
    const originalVideoPreview = document.getElementById(
        "original-video-preview",
    );
    const reversedVideoPreview = document.getElementById(
        "reversed-video-preview",
    );
    const downloadLink = document.getElementById("download-link");
    const downloadBtn = document.getElementById("download-btn");
    const uploadAnotherBtn = document.getElementById("upload-another-btn");
    const originalVideoTime = document.getElementById("original-video-time");
    const reversedVideoTime = document.getElementById("reversed-video-time");

    // Mute Buttons
    const muteButtons = document.querySelectorAll(".mute-btn");

    // --- State Variables for Recording ---
    let mediaRecorder;
    let recordedChunks = [];
    let currentStream; // To hold the MediaStream object for camera/mic
    let isRecording = false; // Track recording state

    // --- Variables to store video URLs for cleanup ---
    let currentOriginalVideoUrl = null;
    let currentReversedVideoUrl = null;

    // --- UI Mode Switching ---
    function showMode(mode) {
        // Pause videos if currently in result section before switching away
        if (resultSection.classList.contains("show")) {
            originalVideoPreview.pause();
            reversedVideoPreview.pause();
        }

        // First, hide current sections with fade out
        uploadSection.classList.remove("active");
        recordSection.classList.remove("active");
        showUploadModeBtn.classList.remove("active-mode-btn");
        showRecordModeBtn.classList.remove("active-mode-btn");

        // Hide result section when switching modes
        resultSection.classList.remove("show");
        setTimeout(() => {
            resultSection.style.display = "none";
        }, 600);

        // Wait for fade out, then show new section
        setTimeout(() => {
            if (mode === "upload") {
                uploadSection.classList.add("active");
                showUploadModeBtn.classList.add("active-mode-btn");
                resetUploadForm();
                if (currentStream) {
                    // Stop camera if active when switching to upload
                    stopCamera();
                }
            } else if (mode === "record") {
                recordSection.classList.add("active");
                showRecordModeBtn.classList.add("active-mode-btn");
                resetRecordingInterface();
                // Delay camera start to allow UI transition to complete
                setTimeout(() => {
                    startCamera();
                }, 200);
            }
        }, 150);
    }

    showUploadModeBtn.addEventListener("click", () => {
        if (!showUploadModeBtn.classList.contains("active-mode-btn")) {
            showMode("upload");
        }
    });
    showRecordModeBtn.addEventListener("click", () => {
        if (!showRecordModeBtn.classList.contains("active-mode-btn")) {
            showMode("record");
        }
    });

    // --- State for time estimation ---
    let uploadStartTime = null;
    let estimatedFileSize = 0;
    let estimateUpdateInterval = null;

    // --- Helper for Progress Bar and Messages ---
    function updateProgress(
        container,
        bar,
        messageElem,
        text,
        percent = 0,
        type = "",
        preserveSpinner = false,
    ) {
        if (messageElem) {
            // Ensure messageElem exists before trying to update it
            if (preserveSpinner && messageElem.querySelector(".spinner")) {
                // Preserve existing spinner and only update text
                const textNode =
                    messageElem.childNodes[messageElem.childNodes.length - 1];
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    textNode.textContent = text.replace(
                        '<span class="spinner"></span> ',
                        "",
                    );
                } else {
                    // If no text node exists, add one
                    messageElem.appendChild(
                        document.createTextNode(
                            text.replace('<span class="spinner"></span> ', ""),
                        ),
                    );
                }
            } else {
                messageElem.innerHTML = text; // Use innerHTML for spinner
            }
            messageElem.className = `message ${type}`;
        }

        if (container && bar) {
            // Ensure container and bar exist
            // Show container if it's a loading message or if progress is being shown
            if (type === "loading" || (percent > 0 && percent <= 100)) {
                container.style.display = "block";
                container.classList.add("show");
                bar.style.width = `${percent}%`;
            } else {
                container.classList.remove("show");
                setTimeout(() => {
                    container.style.display = "none";
                }, 400);
                bar.style.width = "0%";
            }
        }
    }

    // --- Time estimation helper ---
    function getTimeEstimate(percent, startTime, fileSize) {
        if (!startTime || percent <= 0) return null;

        const elapsedTime = Date.now() - startTime;
        const uploadTimeRemaining =
            percent < 100 ? ((100 - percent) / percent) * elapsedTime : 0;

        // Rough processing time estimation based on file size (adjust multiplier as needed)
        const processingTimeEstimate =
            fileSize > 0 ? Math.max(5000, (fileSize / 1000000) * 2000) : 10000; // 2s per MB, min 5s

        let totalTimeRemaining;
        if (percent < 100) {
            totalTimeRemaining = uploadTimeRemaining + processingTimeEstimate;
        } else {
            // During processing, estimate remaining processing time (rough)
            const processingElapsed = elapsedTime - elapsedTime * 0.8; // Assume 80% was upload
            totalTimeRemaining = Math.max(
                1000,
                processingTimeEstimate - processingElapsed,
            );
        }

        const minutes = Math.floor(totalTimeRemaining / 60000);
        const seconds = Math.floor((totalTimeRemaining % 60000) / 1000);

        if (minutes > 0) {
            return `~${minutes}m ${seconds}s remaining`;
        } else if (seconds > 0) {
            return `~${seconds}s remaining`;
        }
        return "almost done";
    }

    // --- Helper to update estimate display ---
    function updateEstimateDisplay(sourceMode, estimate) {
        const estimateElementId =
            sourceMode === "upload" ? "upload-estimate" : "record-estimate";
        let estimateElement = document.getElementById(estimateElementId);

        if (!estimateElement) {
            // Create estimate element if it doesn't exist
            estimateElement = document.createElement("div");
            estimateElement.id = estimateElementId;
            estimateElement.className = "estimate-display";

            const parentElement =
                sourceMode === "upload"
                    ? uploadStatusMessage.parentNode
                    : recordUploadStatusMessage.parentNode;
            parentElement.appendChild(estimateElement);
        }

        if (estimate) {
            estimateElement.textContent = `Estimate: ${estimate}`;
            estimateElement.style.display = "block";
        } else {
            estimateElement.style.display = "none";
        }
    }

    // --- Upload Logic ---
    function resetUploadForm() {
        uploadForm.reset();
        selectedFileName.textContent = "";
        updateProgress(
            uploadProgressContainer,
            uploadProgressBar,
            uploadStatusMessage,
            "",
        ); // Clear message
        browseBtn.style.display = "inline-flex"; // Ensure browse button is visible
    }

    dropArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropArea.classList.add("dragging");
    });

    dropArea.addEventListener("dragleave", () => {
        dropArea.classList.remove("dragging");
    });

    dropArea.addEventListener("drop", (e) => {
        e.preventDefault();
        dropArea.classList.remove("dragging");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            videoInput.files = files;
            selectedFileName.textContent = `Selected: ${files[0].name}`;
            processAndUploadFile(files[0], "upload"); // Directly process dropped file
        }
    });

    browseBtn.addEventListener("click", () => {
        videoInput.click();
    });

    videoInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            selectedFileName.textContent = `Selected: ${file.name}`;
            processAndUploadFile(file, "upload"); // Process selected file
        } else {
            selectedFileName.textContent = "";
        }
    });

    // Centralized function to handle file upload (from drag/drop or browse or recorded)
    function processAndUploadFile(file, sourceMode) {
        if (!file || !file.type.startsWith("video/")) {
            const messageElem =
                sourceMode === "upload"
                    ? uploadStatusMessage
                    : recordUploadStatusMessage;
            const progressCont =
                sourceMode === "upload"
                    ? uploadProgressContainer
                    : recordProgressContainer;
            const progressBar =
                sourceMode === "upload" ? uploadProgressBar : recordProgressBar;
            updateProgress(
                progressCont,
                progressBar,
                messageElem,
                "Please upload a valid video file.",
                0,
                "error",
            );
            return;
        }

        const formData = new FormData();
        formData.append("video", file);

        const messageElem =
            sourceMode === "upload"
                ? uploadStatusMessage
                : recordUploadStatusMessage;
        const progressCont =
            sourceMode === "upload"
                ? uploadProgressContainer
                : recordProgressContainer;
        const progressBar =
            sourceMode === "upload" ? uploadProgressBar : recordProgressBar;

        // Initialize time estimation variables
        uploadStartTime = Date.now();
        estimatedFileSize = file.size;

        updateProgress(
            progressCont,
            progressBar,
            messageElem,
            '<span class="spinner"></span> Uploading & Processing...',
            0,
            "loading",
        );

        // Start auto-updating estimate every second during processing
        estimateUpdateInterval = setInterval(() => {
            if (uploadStartTime) {
                const timeEstimate = getTimeEstimate(
                    100,
                    uploadStartTime,
                    estimatedFileSize,
                );
                updateEstimateDisplay(sourceMode, timeEstimate);
            }
        }, 1000);

        // Disable relevant buttons during upload
        if (sourceMode === "upload") {
            browseBtn.disabled = true;
            dropArea.style.pointerEvents = "none"; // Disable drag/drop
        } else {
            // 'record' mode
            uploadRecordedBtn.disabled = true;
            retakeRecordedBtn.disabled = true;
        }

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/upload", true); // Assuming a '/upload' endpoint for backend processing

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                const timeEstimate = getTimeEstimate(
                    percentComplete,
                    uploadStartTime,
                    estimatedFileSize,
                );

                if (percentComplete >= 100) {
                    updateProgress(
                        progressCont,
                        progressBar,
                        messageElem,
                        "Processing. This can take a while.",
                        100,
                        "loading",
                        true,
                    );
                } else {
                    updateProgress(
                        progressCont,
                        progressBar,
                        messageElem,
                        `Uploading: ${Math.round(percentComplete)}%`,
                        percentComplete,
                        "loading",
                        true,
                    );
                }

                updateEstimateDisplay(sourceMode, timeEstimate);
            }
        });

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        updateProgress(
                            progressCont,
                            progressBar,
                            messageElem,
                            "Video processed successfully!",
                            100,
                            "success",
                        );
                        displayResult(
                            data.originalVideoUrl,
                            data.reversedVideoUrl,
                        );
                    } else {
                        updateProgress(
                            progressCont,
                            progressBar,
                            messageElem,
                            `Error: ${data.message}`,
                            0,
                            "error",
                        );
                    }
                } else {
                    updateProgress(
                        progressCont,
                        progressBar,
                        messageElem,
                        `Server error: ${xhr.statusText || "Unknown error"}`,
                        0,
                        "error",
                    );
                }
                // Re-enable buttons and hide progress bar in finally block equivalent
                if (sourceMode === "upload") {
                    browseBtn.disabled = false;
                    dropArea.style.pointerEvents = "auto"; // Re-enable drag/drop
                } else {
                    // 'record' mode
                    uploadRecordedBtn.disabled = false;
                    retakeRecordedBtn.disabled = false;
                }
                updateProgress(
                    progressCont,
                    progressBar,
                    messageElem,
                    messageElem.textContent,
                    0,
                    messageElem.className.replace("message ", ""),
                ); // Hide bar, keep last message

                // Reset time estimation variables
                uploadStartTime = null;
                estimatedFileSize = 0;

                // Clear estimate interval and hide display
                if (estimateUpdateInterval) {
                    clearInterval(estimateUpdateInterval);
                    estimateUpdateInterval = null;
                }
                updateEstimateDisplay(sourceMode, null);
            }
        };

        xhr.send(formData);
    }

    // --- Recording Logic ---
    function resetRecordingInterface() {
        stopCamera(); // Ensure camera is stopped before resetting
        liveCameraFeed.srcObject = null;
        liveCameraFeed.classList.remove("visible"); // Hide video until stream is ready
        const recordArea = document.querySelector(
            "#record-section .record-area",
        );
        recordArea.classList.remove("expanded"); // Contract the container
        recordingStatus.textContent = 'Click "Start Recording" to begin';
        recordingStatus.classList.remove("loading", "error", "success");
        startRecordingBtn.style.display = "inline-flex";
        startRecordingBtn.disabled = false; // Enable start button
        stopRecordingBtn.style.display = "none";
        stopRecordingBtn.disabled = true; // Disable stop button
        uploadRecordedBtn.style.display = "none";
        uploadRecordedBtn.disabled = true; // Disable upload recorded button
        retakeRecordedBtn.style.display = "none";
        retakeRecordedBtn.disabled = true; // Disable retake button
        recordedChunks = [];
        isRecording = false;
        updateProgress(
            recordProgressContainer,
            recordProgressBar,
            recordUploadStatusMessage,
            "",
        ); // Clear message
    }

    async function startCamera() {
        const recordArea = document.querySelector(
            "#record-section .record-area",
        );

        if (currentStream) {
            // If camera is already running, no need to restart
            liveCameraFeed.srcObject = currentStream;
            recordArea.classList.add("expanded"); // Expand container
            liveCameraFeed.classList.add("visible");
            updateProgress(
                null,
                null,
                recordingStatus,
                "Ready to record.",
                0,
                "success",
            );
            startRecordingBtn.disabled = false; // Enable start button if camera is ready
            return;
        }

        try {
            updateProgress(
                null,
                null,
                recordingStatus,
                '<span class="spinner"></span> Requesting camera access...',
                0,
                "loading",
            );
            startRecordingBtn.disabled = true; // Disable start button while requesting access
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            currentStream = stream; // Store the stream
            liveCameraFeed.srcObject = stream;
            recordArea.classList.add("expanded"); // Expand container
            liveCameraFeed.classList.add("visible");
            liveCameraFeed.onloadedmetadata = () => {
                liveCameraFeed.play();
                updateProgress(
                    null,
                    null,
                    recordingStatus,
                    "Ready to record.",
                    0,
                    "success",
                );
                startRecordingBtn.disabled = false; // Enable start button once camera is ready
            };
        } catch (err) {
            console.error("Error accessing camera/mic:", err);
            updateProgress(
                null,
                null,
                recordingStatus,
                `Failed to access camera: ${err.name || err.message}. Please allow access.`,
                0,
                "error",
            );
            startRecordingBtn.disabled = true; // Keep start button disabled if access fails
        }
    }

    function stopCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach((track) => track.stop());
            currentStream = null;
        }
        const recordArea = document.querySelector(
            "#record-section .record-area",
        );
        recordArea.classList.remove("expanded"); // Contract container
    }

    startRecordingBtn.addEventListener("click", () => {
        if (!currentStream || !currentStream.active) {
            updateProgress(
                null,
                null,
                recordingStatus,
                "Camera not ready. Please allow access and try again.",
                0,
                "error",
            );
            startCamera(); // Attempt to start camera again if not ready
            return;
        }

        recordedChunks = [];
        // Ensure mimeType is supported by the browser. video/webm is generally good.
        // You might check MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')
        mediaRecorder = new MediaRecorder(currentStream, {
            mimeType: "video/webm; codecs=vp8,opus",
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            isRecording = false;
            updateProgress(
                null,
                null,
                recordingStatus,
                "Recording stopped. Ready to upload or retake.",
                0,
                "success",
            );
            startRecordingBtn.style.display = "none";
            stopRecordingBtn.style.display = "none";
            uploadRecordedBtn.style.display = "inline-flex";
            uploadRecordedBtn.disabled = false; // Enable upload button
            retakeRecordedBtn.style.display = "inline-flex";
            retakeRecordedBtn.disabled = false; // Enable retake button

            // Stop live camera feed on screen after recording stops
            stopCamera();
            liveCameraFeed.srcObject = null; // Clear the stream from the video element
            liveCameraFeed.classList.remove("visible"); // Hide the video element
        };

        mediaRecorder.onerror = (event) => {
            isRecording = false;
            console.error("MediaRecorder error:", event.error);
            updateProgress(
                null,
                null,
                recordingStatus,
                `Recording error: ${event.error.name || event.error.message}`,
                0,
                "error",
            );
            stopRecordingBtn.style.display = "none";
            startRecordingBtn.style.display = "inline-flex";
            startRecordingBtn.disabled = false; // Re-enable start button
            uploadRecordedBtn.style.display = "none";
            retakeRecordedBtn.style.display = "none";
            // Optionally, stop camera on error
            stopCamera();
            liveCameraFeed.srcObject = null;
            liveCameraFeed.classList.remove("visible");
        };

        mediaRecorder.start();
        isRecording = true;
        updateProgress(
            null,
            null,
            recordingStatus,
            '<span class="spinner"></span> Recording...',
            0,
            "loading",
        );
        startRecordingBtn.style.display = "none";
        stopRecordingBtn.style.display = "inline-flex";
        stopRecordingBtn.disabled = false; // Enable stop button
        uploadRecordedBtn.style.display = "none";
        retakeRecordedBtn.style.display = "none";
    });

    stopRecordingBtn.addEventListener("click", () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
            stopRecordingBtn.disabled = true; // Disable stop button immediately after click
        }
    });

    uploadRecordedBtn.addEventListener("click", () => {
        if (recordedChunks.length === 0) {
            updateProgress(
                recordProgressContainer,
                recordProgressBar,
                recordUploadStatusMessage,
                "No recorded video to upload.",
                0,
                "error",
            );
            return;
        }

        const recordedBlob = new Blob(recordedChunks, { type: "video/webm" });
        const recordedFile = new File(
            [recordedBlob],
            `recorded-video-${Date.now()}.webm`,
            { type: "video/webm" },
        );

        processAndUploadFile(recordedFile, "record"); // Reuse the existing upload logic
        // Update UI specific to recording upload
        uploadRecordedBtn.disabled = true;
        retakeRecordedBtn.disabled = true;
    });

    retakeRecordedBtn.addEventListener("click", () => {
        resetRecordingInterface();
        startCamera(); // Restart camera for a new recording
    });

    // --- Result Display Logic ---
    function displayResult(originalUrl, reversedUrl) {
        // Directly assign the provided URLs
        originalVideoPreview.src = originalUrl;
        reversedVideoPreview.src = reversedUrl;
        downloadLink.href = reversedUrl;
        downloadLink.download = "reversed-video.mp4"; // Suggest a filename for download

        // Store URLs for cleanup (these are the actual URLs now)
        currentOriginalVideoUrl = originalUrl;
        currentReversedVideoUrl = reversedUrl;

        // Reset times to 0:00 initially
        originalVideoTime.textContent = "0:00 / 0:00";
        reversedVideoTime.textContent = "0:00 / 0:00";

        // Event listeners to update time as videos load/play
        const updateVideoTimeDisplay = (videoElement, timeElement) => {
            videoElement.addEventListener("loadedmetadata", () => {
                const duration = videoElement.duration;
                if (!isNaN(duration) && isFinite(duration)) {
                    // Check if duration is a valid number
                    timeElement.textContent = `0:00 / ${formatTime(duration)}`;
                } else {
                    timeElement.textContent = "0:00 / 0:00"; // Fallback if duration is invalid
                }
            });
            videoElement.addEventListener("timeupdate", () => {
                const currentTime = videoElement.currentTime;
                const duration = videoElement.duration;
                if (!isNaN(duration) && isFinite(duration)) {
                    // Check if duration is a valid number
                    timeElement.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
                }
            });
            // Handle potential errors loading video
            videoElement.addEventListener("error", (e) => {
                console.error(`Error loading video ${videoElement.id}:`, e);
                timeElement.textContent = "Error loading video";
            });
        };

        updateVideoTimeDisplay(originalVideoPreview, originalVideoTime);
        updateVideoTimeDisplay(reversedVideoPreview, reversedVideoTime);

        // Ensure videos start muted and handle mute buttons
        originalVideoPreview.muted = true;
        reversedVideoPreview.muted = true;
        muteButtons.forEach((button) => {
            const videoId = button.dataset.videoId;
            const videoElement = document.getElementById(videoId);
            const icon = button.querySelector(".material-symbols-outlined");
            icon.textContent = videoElement.muted ? "volume_off" : "volume_up";
        });

        // Hide upload/record sections and show result section
        uploadSection.classList.remove("active");
        recordSection.classList.remove("active");
        resultSection.style.display = "block";
        resultSection.classList.add("show");
    }

    // Function to format time for video display
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
    }

    // --- Mute/Unmute Buttons ---
    muteButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const videoId = button.dataset.videoId;
            const videoElement = document.getElementById(videoId);
            const icon = button.querySelector(".material-symbols-outlined");

            videoElement.muted = !videoElement.muted; // Toggle muted state
            icon.textContent = videoElement.muted ? "volume_off" : "volume_up"; // Update icon
        });
    });

    // --- Server Cleanup Function ---
    async function requestServerCleanup(originalUrl, reversedUrl) {
        try {
            await fetch("/cleanup-video", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    originalVideoUrl: originalUrl,
                    reversedVideoUrl: reversedUrl,
                }),
            });
            console.log("Server cleanup requested successfully");
        } catch (error) {
            console.error("Error requesting server cleanup:", error);
        }
    }

    // --- Upload Another Video Button ---
    uploadAnotherBtn.addEventListener("click", () => {
        // Pause and reset videos before leaving preview
        originalVideoPreview.pause();
        reversedVideoPreview.pause();
        originalVideoPreview.currentTime = 0;
        reversedVideoPreview.currentTime = 0;

        resultSection.classList.remove("show");
        setTimeout(() => {
            resultSection.style.display = "none";
        }, 600);
        showMode("upload"); // Go back to upload mode by default
    });

    // --- Handle Browser Back/Forward Buttons ---
    window.addEventListener("popstate", (event) => {
        // Pause videos when navigating away from preview
        if (resultSection.classList.contains("show")) {
            originalVideoPreview.pause();
            reversedVideoPreview.pause();
            originalVideoPreview.currentTime = 0;
            reversedVideoPreview.currentTime = 0;
        }

        if (event.state && event.state.section === "preview") {
            // Going back to preview mode
            uploadSection.classList.remove("active");
            recordSection.classList.remove("active");
            resultSection.style.display = "block";
            resultSection.classList.add("show");
        } else {
            // Default to upload mode for any other state
            showMode("upload");
        }
    });

    // --- Cleanup on page unload ---
    window.addEventListener("beforeunload", () => {
        // Also pause videos on unload to be safe
        originalVideoPreview.pause();
        reversedVideoPreview.pause();

        // Clear estimate interval
        if (estimateUpdateInterval) {
            clearInterval(estimateUpdateInterval);
            estimateUpdateInterval = null;
        }

        if (currentOriginalVideoUrl && currentReversedVideoUrl) {
            // Use sendBeacon for reliable cleanup on page unload
            navigator.sendBeacon(
                "/cleanup-video",
                JSON.stringify({
                    originalVideoUrl: currentOriginalVideoUrl,
                    reversedVideoUrl: currentReversedVideoUrl,
                }),
            );
        }
    });

    // --- Initial State ---

    // Get all fullscreen buttons
    const fullscreenButtons = document.querySelectorAll(".fullscreen-btn");

    // Function to toggle fullscreen for a given video element
    function toggleFullscreen(videoElement) {
        if (videoElement.requestFullscreen) {
            videoElement.requestFullscreen();
        } else if (videoElement.mozRequestFullScreen) {
            /* Firefox */
            videoElement.mozRequestFullScreen();
        } else if (videoElement.webkitRequestFullscreen) {
            /* Chrome, Safari and Opera */
            videoElement.webkitRequestFullscreen();
        } else if (videoElement.msRequestFullscreen) {
            /* IE/Edge */
            videoElement.msRequestFullscreen();
        }
    }

    // Add click event listeners to each fullscreen button
    fullscreenButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const videoId = button.dataset.videoId;
            const videoElement = document.getElementById(videoId);
            if (videoElement) {
                toggleFullscreen(videoElement);
            }
        });
    });

    // Hide controls when entering fullscreen
    function handleFullscreenChange() {
        const fullscreenElement =
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

        if (
            fullscreenElement &&
            (fullscreenElement.id === "original-video-preview" ||
                fullscreenElement.id === "reversed-video-preview")
        ) {
            // Hide all controls for the fullscreen video
            const videoWrapper = fullscreenElement.closest(".video-wrapper");
            if (videoWrapper) {
                videoWrapper.classList.add("fullscreen-mode");
            }
        } else {
            // Show controls when exiting fullscreen
            document.querySelectorAll(".video-wrapper").forEach((wrapper) => {
                wrapper.classList.remove("fullscreen-mode");
            });
        }
    }

    // Add fullscreen change event listeners
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
});

// Prevent right-click context menu (for modern feel and security)
document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
});
