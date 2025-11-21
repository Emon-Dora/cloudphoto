class GitHubPhotoSync {
    constructor() {
        this.repoOwner = null;
        this.repoName = 'photo-storage-repo'; // 你可以修改这个
        this.token = '';
        this.photosIssueTitle = '照片存储数据';
        this.connected = false;
        
        this.init();
    }

    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadToken();
    }

    initializeElements() {
        this.elements = {
            githubToken: document.getElementById('githubToken'),
            testConnection: document.getElementById('testConnection'),
            connectionStatus: document.getElementById('connectionStatus'),
            syncDownload: document.getElementById('syncDownload'),
            syncUpload: document.getElementById('syncUpload')
        };
    }

    setupEventListeners() {
        this.elements.testConnection.addEventListener('click', () => {
            this.testConnection();
        });

        this.elements.syncDownload.addEventListener('click', () => {
            this.syncFromGitHub();
        });

        this.elements.syncUpload.addEventListener('click', () => {
            this.syncToGitHub();
        });
    }

    // 测试GitHub连接
    async testConnection() {
        const token = this.elements.githubToken.value.trim();
        if (!token) {
            this.showConnectionStatus(false, '请输入GitHub Token');
            return;
        }

        try {
            const user = await this.makeGitHubRequest('/user', token);
            this.token = token;
            this.repoOwner = user.login;
            this.connected = true;
            this.saveToken();
            
            this.showConnectionStatus(true, `已连接用户: ${user.login}`);
            
            // 如果连接成功，检查是否需要创建照片存储仓库
            await this.ensurePhotoStorageRepo();
            
        } catch (error) {
            console.error('Connection test failed:', error);
            this.connected = false;
            this.showConnectionStatus(false, '连接失败，请检查Token');
        }
    }

    // 显示连接状态
    showConnectionStatus(success, message) {
        const status = this.elements.connectionStatus;
        const indicator = status.querySelector('.status-indicator');
        const text = status.querySelector('.status-text');
        
        if (success) {
            status.className = 'connection-status connected';
            indicator.className = 'status-indicator connected';
        } else {
            status.className = 'connection-status disconnected';
            indicator.className = 'status-indicator disconnected';
        }
        
        text.textContent = message;
    }

    // 创建照片存储仓库
    async ensurePhotoStorageRepo() {
        try {
            await this.makeGitHubRequest('/repos/' + this.repoOwner + '/' + this.repoName, this.token);
            // 仓库已存在
        } catch (error) {
            if (error.status === 404) {
                // 仓库不存在，创建新仓库
                try {
                    await this.createRepo();
                } catch (createError) {
                    console.warn('Failed to create repo:', createError);
                }
            }
        }
    }

    // 创建GitHub仓库
    async createRepo() {
        const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: this.repoName,
                description: '照片存储云端仓库',
                private: false
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to create repo: ${response.statusText}`);
        }

        // 创建README文件
        await this.createReadmeFile();
        
        this.showToast('照片存储仓库创建成功！', 'success');
    }

    // 创建README文件
    async createReadmeFile() {
        const readmeContent = '# 照片存储云端仓库\n\n这个仓库用于存储用户的照片数据。\n\n## 使用说明\n\n1. 使用GitHub Token进行身份验证\n2. 照片数据通过Issues存储\n3. 支持云端同步和备份\n\n## 数据结构\n\n照片数据以JSON格式存储在GitHub Issues中，包含：\n- 照片ID\n- 文件名\n- Base64编码的图片数据\n- 文件大小信息\n- 上传时间\n- 压缩比例\n';
        
        const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/README.md`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Add README for photo storage',
                content: btoa(readmeContent)
            })
        });
    }

    // 上传到GitHub
    async syncToGitHub() {
        if (!this.connected) {
            this.showToast('请先连接GitHub', 'error');
            return;
        }

        const photos = JSON.parse(localStorage.getItem('photoStorage') || '[]');
        if (photos.length === 0) {
            this.showToast('没有照片可上传', 'error');
            return;
        }

        try {
            // 创建或更新照片存储Issue
            await this.upsertPhotosIssue(photos);
            
            this.showToast(`成功上传 ${photos.length} 张照片到云端`, 'success');
            
            // 更新存储信息显示
            this.updateStorageInfo();
            
        } catch (error) {
            console.error('Upload to GitHub failed:', error);
            this.showToast('上传失败，请重试', 'error');
        }
    }

    // 从GitHub下载
    async syncFromGitHub() {
        if (!this.connected) {
            this.showToast('请先连接GitHub', 'error');
            return;
        }

        try {
            const photos = await this.getPhotosFromIssue();
            
            if (!photos || photos.length === 0) {
                this.showToast('云端没有找到照片数据', 'warning');
                return;
            }

            // 备份当前数据
            const currentPhotos = localStorage.getItem('photoStorage');
            if (currentPhotos) {
                localStorage.setItem('backup_' + Date.now(), currentPhotos);
            }

            // 导入云端数据
            localStorage.setItem('photoStorage', JSON.stringify(photos));
            
            // 刷新主页面照片显示
            if (window.photoStorage) {
                window.photoStorage.photos = photos;
                window.photoStorage.renderPhotos();
            }
            
            this.showToast(`成功从云端下载 ${photos.length} 张照片`, 'success');
            
            // 更新存储信息显示
            this.updateStorageInfo();
            
        } catch (error) {
            console.error('Download from GitHub failed:', error);
            this.showToast('下载失败，请重试', 'error');
        }
    }

    // 创建或更新照片存储Issue
    async upsertPhotosIssue(photos) {
        const issueData = {
            title: this.photosIssueTitle,
            body: JSON.stringify({
                photos: photos,
                totalCount: photos.length,
                lastUpdated: new Date().toISOString(),
                version: '2.0'
            })
        };

        // 查找现有的照片存储Issue
        const existingIssues = await this.makeGitHubRequest(
            `/repos/${this.repoOwner}/${this.repoName}/issues?state=all&labels=photo-storage`,
            this.token
        );

        let issue;
        const existingIssue = existingIssues.find(i => i.title === this.photosIssueTitle);

        if (existingIssue) {
            // 更新现有Issue
            const response = await this.makeGitHubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/issues/${existingIssue.number}`,
                this.token,
                'PATCH',
                issueData
            );
            issue = response;
        } else {
            // 创建新Issue
            const response = await this.makeGitHubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/issues`,
                this.token,
                'POST',
                issueData
            );
            issue = response;

            // 添加标签
            await this.addLabelToIssue(issue.number);
        }

        return issue;
    }

    // 获取照片数据
    async getPhotosFromIssue() {
        const issues = await this.makeGitHubRequest(
            `/repos/${this.repoOwner}/${this.repoName}/issues?state=open&labels=photo-storage`,
            this.token
        );

        const photoStorageIssue = issues.find(i => i.title === this.photosIssueTitle);
        if (!photoStorageIssue) {
            return [];
        }

        try {
            const data = JSON.parse(photoStorageIssue.body);
            return data.photos || [];
        } catch (error) {
            console.error('Failed to parse photo data:', error);
            return [];
        }
    }

    // 为Issue添加标签
    async addLabelToIssue(issueNumber) {
        try {
            await this.makeGitHubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/issues/${issueNumber}/labels`,
                this.token,
                'POST',
                ['photo-storage']
            );
        } catch (error) {
            console.warn('Failed to add label:', error);
        }
    }

    // GitHub API请求
    async makeGitHubRequest(url, token, method = 'GET', data = null) {
        const options = {
            method: method,
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`https://api.github.com${url}`, options);
        
        if (!response.ok) {
            const error = new Error(`GitHub API error: ${response.statusText}`);
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    // 保存Token到localStorage
    saveToken() {
        if (this.token) {
            localStorage.setItem('github_token', this.token);
        }
    }

    // 从localStorage加载Token
    loadToken() {
        const savedToken = localStorage.getItem('github_token');
        if (savedToken) {
            this.elements.githubToken.value = savedToken;
            // 自动测试连接
            setTimeout(() => {
                this.testConnection();
            }, 1000);
        }
    }

    // 更新存储信息显示
    updateStorageInfo() {
        const localPhotos = JSON.parse(localStorage.getItem('photoStorage') || '[]');
        const cloudPhotos = JSON.parse(localStorage.getItem('cloud_photos') || '[]');
        
        const localSize = this.calculateTotalSize(localPhotos);
        const cloudSize = this.calculateTotalSize(cloudPhotos);
        
        const storageInfo = document.getElementById('storageInfo');
        if (storageInfo) {
            storageInfo.textContent = `（本地：${this.formatBytes(localSize)} / 云端：${this.formatBytes(cloudSize)}）`;
        }
    }

    // 计算总大小
    calculateTotalSize(photos) {
        return photos.reduce((total, photo) => total + (photo.compressedSize || photo.size || 0), 0);
    }

    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 显示Toast通知
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastText = document.getElementById('toastText');
        
        if (toast && toastText) {
            toastText.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    }

    // 删除云端照片
    async deleteFromCloud(photoId) {
        if (!this.connected) {
            this.showToast('请先连接GitHub', 'error');
            return;
        }

        try {
            // 获取当前云端照片
            const cloudPhotos = await this.getPhotosFromIssue();
            const filteredPhotos = cloudPhotos.filter(photo => photo.id !== photoId);
            
            // 如果有照片变化，更新云端
            if (filteredPhotos.length !== cloudPhotos.length) {
                await this.upsertPhotosIssue(filteredPhotos);
                this.showToast('云端删除成功', 'success');
            }
            
        } catch (error) {
            console.error('Cloud delete failed:', error);
            this.showToast('云端删除失败', 'error');
        }
    }
}

// 初始化GitHub同步功能
document.addEventListener('DOMContentLoaded', () => {
    window.githubSync = new GitHubPhotoSync();
});