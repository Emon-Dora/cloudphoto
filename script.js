class PhotoStorage {
    constructor() {
        this.photos = this.loadPhotos();
        this.currentPhotoIndex = -1;
        this.init();
    }

    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.renderPhotos();
        lucide.createIcons();
    }

    initializeElements() {
        this.elements = {
            fileInput: document.getElementById('fileInput'),
            uploadButton: document.getElementById('uploadButton'),
            dragDropArea: document.getElementById('dragDropArea'),
            photosGrid: document.getElementById('photosGrid'),
            emptyState: document.getElementById('emptyState'),
            photoCount: document.getElementById('photoCount'),
            galleryStats: document.getElementById('galleryStats'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalImage: document.getElementById('modalImage'),
            modalTitle: document.getElementById('modalTitle'),
            modalOriginalSize: document.getElementById('modalOriginalSize'),
            modalCompressedSize: document.getElementById('modalCompressedSize'),
            modalCompressionRatio: document.getElementById('modalCompressionRatio'),
            modalType: document.getElementById('modalType'),
            modalDate: document.getElementById('modalDate'),
            modalStorage: document.getElementById('modalStorage'),
            modalClose: document.getElementById('modalClose'),
            downloadButton: document.getElementById('downloadButton'),
            syncDeleteButton: document.getElementById('syncDeleteButton'),
            deleteButton: document.getElementById('deleteButton'),
            toast: document.getElementById('toast'),
            toastText: document.getElementById('toastText'),
            compressionProgress: document.getElementById('compressionProgress'),
            progressFill: document.getElementById('progressFill'),
            progressStats: document.getElementById('progressStats'),
            storageInfo: document.getElementById('storageInfo')
        };
        
        // 初始化图片压缩器
        this.compressor = new ImageCompressor();
    }

    setupEventListeners() {
        // File input
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Upload button
        this.elements.uploadButton.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // Drag and drop
        this.elements.dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dragDropArea.classList.add('dragover');
        });

        this.elements.dragDropArea.addEventListener('dragleave', () => {
            this.elements.dragDropArea.classList.remove('dragover');
        });

        this.elements.dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dragDropArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // Modal events
        this.elements.modalClose.addEventListener('click', () => {
            this.closeModal();
        });

        this.elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.modalOverlay) {
                this.closeModal();
            }
        });

        this.elements.downloadButton.addEventListener('click', () => {
            this.downloadPhoto();
        });

        this.elements.deleteButton.addEventListener('click', () => {
            this.deletePhoto();
        });

        this.elements.syncDeleteButton.addEventListener('click', () => {
            this.deleteFromCloud();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async handleFiles(files) {
        const fileArray = Array.from(files);
        const validFiles = fileArray.filter(file => this.validateFile(file));

        if (validFiles.length === 0) {
            this.showToast('请选择有效的图片文件', 'error');
            return;
        }

        if (validFiles.length !== fileArray.length) {
            this.showToast('部分文件格式不支持或大小超过限制', 'error');
        }

        // 使用新的压缩上传方法
        await this.uploadFilesWithCompression(validFiles);
    }

    async uploadFilesWithCompression(files) {
        this.showCompressionProgress(true);
        
        try {
            let processedCount = 0;
            const totalFiles = files.length;
            
            for (const file of files) {
                processedCount++;
                
                // 更新进度
                this.updateCompressionProgress(processedCount, totalFiles, `正在压缩：${file.name}`);
                
                // 压缩文件
                const compressionResult = await this.compressor.compressImage(file);
                
                // 创建照片对象
                const photo = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    data: compressionResult.compressedDataURL,
                    type: file.type,
                    originalSize: compressionResult.originalSize,
                    compressedSize: compressionResult.compressedSize,
                    compressionRatio: compressionResult.compressionRatio,
                    width: compressionResult.compressedWidth,
                    height: compressionResult.compressedHeight,
                    uploadDate: new Date().toISOString(),
                    storage: 'local' // 标记存储位置
                };

                this.photos.unshift(photo);
                
                // 小延迟以显示进度
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // 完成处理
            this.savePhotos();
            this.renderPhotos();
            this.showCompressionProgress(false);
            
            const totalOriginalSize = files.reduce((sum, file) => sum + file.size, 0);
            const totalCompressedSize = this.photos
                .slice(0, files.length)
                .reduce((sum, photo) => sum + photo.compressedSize, 0);
            
            const savedSpace = this.formatFileSize(totalOriginalSize - totalCompressedSize);
            
            this.showToast(`成功处理 ${files.length} 张照片，节省空间 ${savedSpace}`);
            
        } catch (error) {
            this.showCompressionProgress(false);
            this.showToast('上传失败，请重试', 'error');
            console.error('Upload error:', error);
        }
    }

    showCompressionProgress(show) {
        this.elements.compressionProgress.style.display = show ? 'block' : 'none';
    }

    updateCompressionProgress(current, total, message) {
        const percentage = (current / total) * 100;
        this.elements.progressFill.style.width = percentage + '%';
        this.elements.progressStats.textContent = `${current}/${total} - ${message}`;
    }

    validateFile(file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        const maxSize = 50 * 1024 * 1024; // 50MB - 压缩后可以处理更大的文件

        if (!validTypes.includes(file.type)) {
            return false;
        }

        if (file.size > maxSize) {
            return false;
        }

        return true;
    }

    processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const photo = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    data: e.target.result,
                    type: file.type,
                    size: file.size,
                    uploadDate: new Date().toISOString()
                };

                this.photos.unshift(photo);
                this.savePhotos();
                resolve();
            };

            reader.onerror = () => {
                reject(new Error('File reading failed'));
            };

            reader.readAsDataURL(file);
        });
    }

    renderPhotos() {
        const { photosGrid, emptyState, photoCount } = this.elements;
        
        photosGrid.innerHTML = '';

        if (this.photos.length === 0) {
            emptyState.classList.remove('hidden');
            photoCount.textContent = '0';
            this.updateStorageInfo(); // 更新存储信息
            return;
        }

        emptyState.classList.add('hidden');
        photoCount.textContent = this.photos.length.toString();

        this.photos.forEach((photo, index) => {
            const photoCard = this.createPhotoCard(photo, index);
            photosGrid.appendChild(photoCard);
        });

        lucide.createIcons();
        this.updateStorageInfo(); // 更新存储信息
    }

    updateStorageInfo() {
        const localSize = this.photos.reduce((total, photo) => {
            return total + (photo.compressedSize || photo.size || 0);
        }, 0);

        const cloudSize = JSON.parse(localStorage.getItem('cloud_photos') || '[]')
            .reduce((total, photo) => total + (photo.compressedSize || photo.size || 0), 0);

        if (this.elements.storageInfo) {
            this.elements.storageInfo.textContent = 
                `（本地：${this.formatFileSize(localSize)} / 云端：${this.formatFileSize(cloudSize)}）`;
        }
    }

    createPhotoCard(photo, index) {
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.dataset.index = index;

        const img = document.createElement('img');
        img.src = photo.data;
        img.alt = photo.name;
        img.onerror = () => {
            card.remove();
        };

        const overlay = document.createElement('div');
        overlay.className = 'photo-overlay';

        const name = document.createElement('div');
        name.className = 'photo-name';
        name.textContent = photo.name;

        const actions = document.createElement('div');
        actions.className = 'photo-actions';

        const viewButton = this.createActionButton('eye', '预览', () => {
            this.openModal(index);
        });

        const deleteButton = this.createActionButton('trash-2', '删除', () => {
            this.deletePhotoByIndex(index);
        });

        actions.appendChild(viewButton);
        actions.appendChild(deleteButton);

        overlay.appendChild(name);
        overlay.appendChild(actions);

        card.appendChild(img);
        card.appendChild(overlay);

        // Add click to view
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.photo-actions')) {
                this.openModal(index);
            }
        });

        return card;
    }

    createActionButton(iconName, title, onClick) {
        const button = document.createElement('button');
        button.className = 'photo-action-button';
        button.title = title;

        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', iconName);
        icon.setAttribute('size', '16');

        button.appendChild(icon);
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });

        return button;
    }

    openModal(index) {
        if (index < 0 || index >= this.photos.length) return;

        this.currentPhotoIndex = index;
        const photo = this.photos[index];

        this.elements.modalImage.src = photo.data;
        this.elements.modalTitle.textContent = photo.name;
        
        // 显示原始大小
        this.elements.modalOriginalSize.textContent = this.formatFileSize(photo.originalSize || photo.size);
        
        // 显示压缩后大小
        this.elements.modalCompressedSize.textContent = this.formatFileSize(photo.compressedSize || photo.size);
        
        // 显示压缩比例
        if (photo.compressionRatio) {
            this.elements.modalCompressionRatio.textContent = (photo.compressionRatio * 100).toFixed(1) + '%';
        } else {
            this.elements.modalCompressionRatio.textContent = '未压缩';
        }
        
        this.elements.modalType.textContent = this.getFileTypeDisplay(photo.type);
        this.elements.modalDate.textContent = this.formatDate(photo.uploadDate);
        this.elements.modalStorage.textContent = photo.storage || '本地';

        this.elements.modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        this.elements.modalOverlay.classList.remove('active');
        document.body.style.overflow = '';
        this.currentPhotoIndex = -1;
    }

    downloadPhoto() {
        if (this.currentPhotoIndex === -1) return;

        const photo = this.photos[this.currentPhotoIndex];
        const link = document.createElement('a');
        link.href = photo.data;
        link.download = photo.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast('开始下载');
    }

    deletePhoto() {
        if (this.currentPhotoIndex === -1) return;

        const photo = this.photos[this.currentPhotoIndex];
        
        if (confirm(`确定要删除照片 "${photo.name}" 吗？`)) {
            this.deletePhotoByIndex(this.currentPhotoIndex);
            this.closeModal();
        }
    }

    deletePhotoByIndex(index) {
        if (index < 0 || index >= this.photos.length) return;

        const photo = this.photos[index];
        this.photos.splice(index, 1);
        this.savePhotos();
        this.renderPhotos();
        this.showToast(`已删除照片 "${photo.name}"`);
    }

    deleteFromCloud() {
        if (this.currentPhotoIndex === -1) return;

        const photo = this.photos[this.currentPhotoIndex];
        
        if (confirm(`确定要从云端删除照片 "${photo.name}" 吗？`)) {
            // 删除云端照片
            if (window.githubSync) {
                window.githubSync.deleteFromCloud(photo.id);
            }
            
            // 同时从本地删除
            this.deletePhotoByIndex(this.currentPhotoIndex);
            this.closeModal();
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileTypeDisplay(type) {
        const typeMap = {
            'image/jpeg': 'JPEG',
            'image/jpg': 'JPG',
            'image/png': 'PNG',
            'image/webp': 'WebP',
            'image/gif': 'GIF'
        };
        return typeMap[type] || '未知格式';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showToast(message, type = 'success') {
        const { toast, toastText } = this.elements;
        toastText.textContent = message;
        
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    savePhotos() {
        try {
            localStorage.setItem('photoStorage', JSON.stringify(this.photos));
        } catch (error) {
            console.error('Failed to save photos:', error);
            this.showToast('保存失败，存储空间可能不足', 'error');
        }
    }

    loadPhotos() {
        try {
            const saved = localStorage.getItem('photoStorage');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Failed to load photos:', error);
            return [];
        }
    }

    // Clear all photos (utility method)
    clearAll() {
        if (confirm('确定要清空所有照片吗？此操作不可恢复。')) {
            this.photos = [];
            this.savePhotos();
            this.renderPhotos();
            this.showToast('已清空所有照片');
        }
    }

    // Export photos as JSON (utility method)
    exportPhotos() {
        const dataStr = JSON.stringify(this.photos, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `photos-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast('开始导出备份');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.photoStorage = new PhotoStorage();
});

// Add some utility functions for debugging (can be removed in production)
window.debugPhotoStorage = {
    clearAll: () => window.photoStorage.clearAll(),
    exportPhotos: () => window.photoStorage.exportPhotos(),
    getPhotosCount: () => window.photoStorage.photos.length,
    getStorageSize: () => {
        const data = localStorage.getItem('photoStorage');
        return data ? new Blob([data]).size : 0;
    }
};

// Service Worker registration for offline capability (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Try to register service worker if sw.js exists
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
                // Don't show error to user as SW is optional
            });
    });
}