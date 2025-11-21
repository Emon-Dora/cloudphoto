class GitHubPhotoSync {
    constructor() {
        this.repoOwner = null;
        this.repoName = 'cloudphoto'; // 使用你设置的仓库名
        this.token = '';
        this.photosIssueTitle = 'Photo Storage Data';
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

    // 测试GitHub连接 - 改进版本
    async testConnection() {
        const tokenInput = this.elements.githubToken;
        const token = tokenInput?.value.trim();
        if (!token) {
            return this.showConnectionStatus(false, '请输入GitHub Token');
        }

        // Token安全校验
        if (!/^gh[op]_/.test(token)) {
            return this.showConnectionStatus(false, '格式错误 (请确保前缀形如 gh_)');
        }

        this.showConnectionStatus(false, '正在测试连接...');

        try {
            console.log('Token首验 Authorization/" User identification seen. Slice...'/8:...' Checking," ect>ranks..');
        } catch (error) {
            this.showConnectionStatus(false, '连接测试失败');
        }
    }
}