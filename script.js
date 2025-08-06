class ResponsibleTippingFinder {
    constructor() {
        this.projects = [];
        this.filteredProjects = [];
        this.projectQueue = []; // New: Queue for found projects
        this.isScanning = false; // New: Track scanning state
        this.searchOffset = 0; // New: Track search progression
        this.displayedProjectIds = new Set(); // New: Track displayed projects
        this.searchedCombinations = new Set(); // New: Track searched combinations
        this.pageSize = 12; // New: Projects per "page"
        this.currentSearchStrategy = 0; // New: Current search strategy index
        this.testMode = false; // New: Test mode for debugging
        this.scanStats = { // New: Detailed scan statistics
            totalScanned: 0,
            totalFiltered: 0,
            gamblingFiltered: 0,
            beggingFiltered: 0,
            qualityFiltered: 0
        };
        this.init();
    }

    async init() {
        this.setupEventListeners(); // Move this before loading
        
        // Check if test mode is enabled via URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        this.testMode = urlParams.has('test');
        
        if (this.testMode) {
            console.log('🧪 TEST MODE ENABLED - Enhanced logging active');
            this.logTestModeInfo();
        }
        
        await this.startContinuousSearch();
        this.setupInfiniteScroll(); // New: Setup infinite scroll
    }

    // New: Log test mode information
    logTestModeInfo() {
        console.log('='.repeat(50));
        console.log('🧪 RESPONSIBLE TIPPING FINDER - TEST MODE');
        console.log('='.repeat(50));
        console.log('📊 Tracking:');
        console.log('  - Total projects scanned');
        console.log('  - Projects filtered by category');
        console.log('  - Search strategies used');
        console.log('  - Queue management');
        console.log('='.repeat(50));
    }

    // New: Start continuous search process
    async startContinuousSearch() {
        this.isScanning = true;
        this.showLoadingScreen();
        
        // Start the scanning process
        this.continuousSearch();
    }

    // New: Continuous search that runs in background
    async continuousSearch() {
        while (this.isScanning) {
            try {
                await this.searchBatch();
                
                // Add found projects to display if page has room
                while (this.projectQueue.length > 0 && this.canAddMoreToPage()) {
                    const projectData = this.projectQueue.shift();
                    this.addProjectToDisplay(projectData);
                }
                
                // Hide loading screen once we have some projects
                if (this.filteredProjects.length > 0) {
                    this.hideLoadingScreen();
                }
                
                // Pause if page is full, otherwise continue
                if (!this.canAddMoreToPage()) {
                    this.pauseScanning();
                } else {
                    // Brief pause between searches
                    await this.sleep(1000);
                }
                
            } catch (error) {
                console.error('Error in continuous search:', error);
                await this.sleep(2000); // Wait before retrying
            }
        }
    }

    // New: Search a batch of projects with guaranteed uniqueness
    async searchBatch() {
        const batchSize = 25;
        let searchAttempts = 0;
        let searchExecuted = false;
        
        // Keep trying different search combinations until we find one we haven't used
        while (!searchExecuted && searchAttempts < 20) {
            const searchConfig = this.generateUniqueSearchConfig();
            const searchKey = this.getSearchKey(searchConfig);
            
            // Skip if we've already searched this combination
            if (this.searchedCombinations.has(searchKey)) {
                searchAttempts++;
                this.currentSearchStrategy++;
                continue;
            }
            
            try {
                // Mark this combination as searched
                this.searchedCombinations.add(searchKey);
                
                let response;
                
                if (searchConfig.type === 'trending') {
                    response = await fetch(`/api/v1/feed/trending?limit=${batchSize}&offset=${searchConfig.offset}&feed=${searchConfig.feed}`);
                } else if (searchConfig.type === 'search') {
                    response = await fetch(`/api/v1/feed/search/${searchConfig.sort}/${searchConfig.term}?limit=${batchSize}&offset=${searchConfig.offset}`);
                } else if (searchConfig.type === 'posts') {
                    response = await fetch(`/api/v1/feed/posts?limit=${batchSize}&offset=${searchConfig.offset}&sort=${searchConfig.sort}`);
                }
                
                if (!response.ok) {
                    if (this.testMode) console.log(`❌ Search failed for ${searchKey}, trying next...`);
                    searchAttempts++;
                    continue;
                }
                
                const data = await response.json();
                const newProjects = data.feed?.data || data.comments?.data || [];
                
                if (this.testMode) {
                    console.log(`📊 Batch ${this.searchOffset}: Found ${newProjects.length} projects with config: ${searchKey}`);
                }
                
                // Filter this batch
                let newProjectsAdded = 0;
                for (const projectData of newProjects) {
                    this.scanStats.totalScanned++;
                    
                    // Handle different data structures
                    const project = projectData.project || projectData.comment?.card_data?.project;
                    const site = projectData.site || projectData.comment?.card_data?.site;
                    
                    if (project && !this.displayedProjectIds.has(project.id)) {
                        const fullProjectData = { project, site, ...projectData };
                        const deserving = await this.isDeservingProject(fullProjectData);
                        
                        if (deserving) {
                            this.projectQueue.push(fullProjectData);
                            newProjectsAdded++;
                            if (this.testMode) {
                                console.log(`✅ Found deserving project: ${project.title} (Views: ${project.stats?.views || 0}, Comments: ${project.stats?.comments || 0})`);
                            }
                        }
                    }
                }
                
                if (this.testMode) {
                    console.log(`📈 Added ${newProjectsAdded} new deserving projects to queue`);
                    console.log(`📊 Total Stats: Scanned: ${this.scanStats.totalScanned}, Queue: ${this.projectQueue.length}, Displayed: ${this.filteredProjects.length}`);
                }
                
                this.searchOffset++;
                searchExecuted = true;
                
            } catch (error) {
                console.error(`Error in search batch for ${searchKey}:`, error);
                searchAttempts++;
            }
        }
        
        // If we couldn't find any unique searches, expand our search space
        if (!searchExecuted) {
            if (this.testMode) console.log('🔄 Expanding search space - all combinations exhausted');
            this.expandSearchSpace();
        }
    }

    // New: Generate a unique search configuration
    generateUniqueSearchConfig() {
        const searchTerms = [
            'game', 'art', 'tool', 'creative', 'portfolio', 'demo', 'experiment', 'design', 
            'simulator', 'fun', 'interactive', 'visual', 'cool', 'amazing', 'awesome', 'app',
            'website', 'animation', 'music', 'code', 'learn', 'tutorial', 'educational',
            'dashboard', 'generator', 'calculator', 'beautiful', 'simple', 'useful', 'build',
            'create', 'make', 'play', 'test', 'try', 'new', 'fresh', 'unique', 'original',
            'custom', 'personal', 'project', 'work', 'showcase', 'display', 'present',
            'share', 'explore', 'discover', 'find', 'search', 'browse', 'view', 'see'
        ];
        
        const feedTypes = ['newest', 'best', 'hot'];
        const trendingFeeds = ['new', 'top', 'hot', 'engaging', 'viral', 'recommended'];
        const postSorts = ['for_you', 'following', 'latest'];
        
        const strategy = this.currentSearchStrategy % 6;
        
        switch (strategy) {
            case 0: // Search with terms
                return {
                    type: 'search',
                    term: searchTerms[this.currentSearchStrategy % searchTerms.length],
                    sort: feedTypes[Math.floor(this.currentSearchStrategy / searchTerms.length) % feedTypes.length],
                    offset: Math.floor(this.currentSearchStrategy / (searchTerms.length * feedTypes.length)) * 25
                };
                
            case 1: // Trending feed
                return {
                    type: 'trending',
                    feed: trendingFeeds[this.currentSearchStrategy % trendingFeeds.length],
                    offset: Math.floor(this.currentSearchStrategy / trendingFeeds.length) * 25
                };
                
            case 2: // Posts feed
                return {
                    type: 'posts',
                    sort: postSorts[this.currentSearchStrategy % postSorts.length],
                    offset: Math.floor(this.currentSearchStrategy / postSorts.length) * 25
                };
                
            case 3: // Multi-word search terms
                const multiTerms = [
                    'web app', 'cool game', 'art project', 'fun tool', 'new demo',
                    'creative work', 'awesome site', 'cool design', 'fun app', 'new project',
                    'amazing work', 'beautiful design', 'useful tool', 'interactive demo',
                    'portfolio site', 'creative showcase', 'fun experiment', 'cool animation'
                ];
                return {
                    type: 'search',
                    term: encodeURIComponent(multiTerms[this.currentSearchStrategy % multiTerms.length]),
                    sort: feedTypes[Math.floor(this.currentSearchStrategy / multiTerms.length) % feedTypes.length],
                    offset: Math.floor(this.currentSearchStrategy / (multiTerms.length * feedTypes.length)) * 25
                };
                
            case 4: // Random deep pagination on trending
                return {
                    type: 'trending',
                    feed: trendingFeeds[this.currentSearchStrategy % trendingFeeds.length],
                    offset: (50 + (this.currentSearchStrategy * 13)) % 500 // Skip around to avoid sequential
                };
                
            case 5: // Random deep pagination on search
                return {
                    type: 'search',
                    term: searchTerms[(this.currentSearchStrategy * 7) % searchTerms.length], // Use prime multiplier
                    sort: feedTypes[(this.currentSearchStrategy * 3) % feedTypes.length],
                    offset: (25 + (this.currentSearchStrategy * 17)) % 400 // Prime multiplier for randomness
                };
                
            default:
                return this.generateUniqueSearchConfig(); // Fallback
        }
    }

    // New: Generate search key for tracking
    getSearchKey(config) {
        if (config.type === 'trending') {
            return `trending_${config.feed}_${config.offset}`;
        } else if (config.type === 'search') {
            return `search_${config.sort}_${config.term}_${config.offset}`;
        } else if (config.type === 'posts') {
            return `posts_${config.sort}_${config.offset}`;
        }
        return `unknown_${JSON.stringify(config)}`;
    }

    // New: Expand search space when we run out of combinations
    expandSearchSpace() {
        console.log('🌟 Expanding search space with new strategies...');
        
        // Add more search terms dynamically
        const additionalTerms = [
            'prototype', 'beta', 'alpha', 'concept', 'idea', 'innovation', 'invention',
            'creation', 'masterpiece', 'wonder', 'marvel', 'surprise', 'discovery',
            'breakthrough', 'achievement', 'accomplishment', 'success', 'triumph'
        ];
        
        // Reset some combinations to allow re-searching with different offsets
        const keysToRemove = Array.from(this.searchedCombinations).filter(key => 
            key.includes('_0') || key.includes('_25') || key.includes('_50')
        ).slice(0, 50); // Remove first 50 early searches to allow re-searching with higher offsets
        
        keysToRemove.forEach(key => this.searchedCombinations.delete(key));
        
        console.log(`Cleared ${keysToRemove.length} early search combinations for re-searching`);
    }

    async loadProjects() {
        try {
            // Get trending projects
            const response = await fetch('/api/v1/feed/trending?limit=50');
            const data = await response.json();
            
            this.projects = data.feed.data;
            console.log(`Loaded ${this.projects.length} projects`);

            // Filter projects based on criteria
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading projects:', error);
            // Fallback to search if trending fails
            await this.loadFromSearch();
        }
    }

    async loadFromSearch() {
        try {
            // Search for various creative terms to find diverse projects
            const searchTerms = ['game', 'art', 'tool', 'creative', 'portfolio', 'demo', 'experiment'];
            const allProjects = [];
            
            for (const term of searchTerms) {
                const response = await fetch(`/api/v1/feed/search/newest/${term}?limit=20`);
                const data = await response.json();
                allProjects.push(...data.feed.data);
            }
            
            this.projects = allProjects;
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading from search:', error);
        }
    }

    async filterDeservingProjects() {
        let filteredProjects = [];
        let attemptCount = 0;
        
        // Try progressively looser filters until we find projects
        while (filteredProjects.length === 0 && attemptCount < 3) {
            filteredProjects = [];
            
            for (const projectData of this.projects) {
                if (await this.isDeservingProject(projectData, attemptCount)) {
                    filteredProjects.push(projectData);
                }
            }
            
            attemptCount++;
            
            // If still no results, try loading more projects
            if (filteredProjects.length === 0 && attemptCount < 3) {
                console.log(`Attempt ${attemptCount}: No projects found, expanding search...`);
                await this.expandSearch();
            }
        }
        
        // Remove duplicates and limit results
        this.filteredProjects = this.removeDuplicates(filteredProjects).slice(0, 12);
        console.log(`Filtered to ${this.filteredProjects.length} deserving projects after ${attemptCount} attempts`);
    }

    async expandSearch() {
        try {
            // Add more search terms for creative projects
            const additionalTerms = ['design', 'simulator', 'fun', 'interactive', 'visual', 'cool', 'amazing', 'awesome'];
            const additionalProjects = [];
            
            for (const term of additionalTerms) {
                const response = await fetch(`/api/v1/feed/search/best/${term}?limit=25`);
                const data = await response.json();
                additionalProjects.push(...data.feed.data);
            }
            
            // Also try getting more from trending with different parameters
            const trendingResponse = await fetch('/api/v1/feed/trending?limit=100&feed=hot');
            const trendingData = await trendingResponse.json();
            additionalProjects.push(...trendingData.feed.data);
            
            this.projects = [...this.projects, ...additionalProjects];
            console.log(`Expanded search to ${this.projects.length} total projects`);
            
        } catch (error) {
            console.error('Error expanding search:', error);
        }
    }

    async isDeservingProject(projectData, filterLevel = 0) {
        const { project, site } = projectData;
        
        if (!project || !site) {
            if (this.testMode) console.log(`❌ Rejected: Missing project or site data`);
            return false;
        }
        
        // Skip if no title or deleted
        if (!project.title || project.deleted_at) {
            if (this.testMode) console.log(`❌ Rejected: No title or deleted project`);
            return false;
        }
        
        const title = (project.title || '').toLowerCase();
        const description = (project.description || '').toLowerCase();
        
        // Fetch actual comments to analyze content
        let actualComments = [];
        let commentAnalysis = { hasGamblingContent: false, hasBeggingContent: false, commentCount: 0 };
        
        try {
            const commentsResponse = await fetch(`/api/v1/projects/${project.id}/comments?limit=20`);
            if (commentsResponse.ok) {
                const commentsData = await commentsResponse.json();
                actualComments = commentsData.comments?.data || [];
                commentAnalysis = await this.analyzeComments(actualComments);
                
                if (this.testMode && commentAnalysis.commentCount > 0) {
                    console.log(`💬 Comments analyzed for "${project.title}": ${commentAnalysis.commentCount} comments, gambling: ${commentAnalysis.hasGamblingContent}, begging: ${commentAnalysis.hasBeggingContent}`);
                }
            }
        } catch (error) {
            if (this.testMode) console.log(`⚠️ Could not fetch comments for project ${project.id}:`, error);
            // Fall back to stats if comment fetching fails
            const stats = project.stats || {};
            commentAnalysis.commentCount = stats.comments || 0;
        }
        
        // If comments contain gambling or begging content, reject
        if (commentAnalysis.hasGamblingContent) {
            this.scanStats.gamblingFiltered++;
            if (this.testMode) console.log(`🎰 Rejected "${project.title}": Contains gambling content in comments`);
            return false;
        }
        
        if (commentAnalysis.hasBeggingContent) {
            this.scanStats.beggingFiltered++;
            if (this.testMode) console.log(`🙏 Rejected "${project.title}": Contains begging content in comments`);
            return false;
        }
        
        // Progressively looser bad keyword filtering
        let badKeywords = [];
        
        if (filterLevel === 0) {
            // Strict filter - only obvious gambling/begging
            badKeywords = [
                'gamble', 'gambling', 'bet', 'betting', 'casino', 'lottery', 
                'jackpot', 'prize money', 'win money', 'pay me now', 'donate money',
                'tip to win', 'tip me please', 'send tips', 'give me credits',
                'pay to', 'pay to play', 'pay to win', 'pay to unlock', 'pay to access',
                'pay to continue', 'pay to get', 'pay to see', 'pay to view',
                'tipping', 'tip for', 'tip me', 'tips please', 'need tips',
                'tip jar', 'tip button', 'accept tips', 'donations welcome',
                '♦', 'diamond', 'credits for', 'coins for', 'tokens for'
            ];
        } else if (filterLevel === 1) {
            // Moderate filter - only clear gambling terms and pay-to patterns
            badKeywords = [
                'gamble', 'gambling', 'casino', 'lottery', 'jackpot',
                'tip to win', 'bet money', 'pay to play', 'pay to win',
                'tip me please', 'send tips', 'tipping', 'tip for',
                '♦', 'credits for'
            ];
        } else {
            // Loose filter - only obvious scams and clear pay-to patterns
            badKeywords = [
                'scam', 'free money', 'guaranteed win', 'pay to win', 
                'tip to win', '♦'
            ];
        }
        
        // Check if project contains bad keywords
        const foundBadKeyword = badKeywords.find(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );
        
        if (foundBadKeyword) {
            this.scanStats.qualityFiltered++;
            if (this.testMode) console.log(`🚫 Rejected "${project.title}": Contains bad keyword "${foundBadKeyword}"`);
            return false;
        }
        
        // Look for quality indicators with progressively looser criteria
        const stats = project.stats || {};
        const views = stats.views || 0;
        const comments = commentAnalysis.commentCount;
        const likes = stats.likes || 0;
        
        // Progressively looser filtering criteria
        let passed = false;
        let reason = '';
        
        if (filterLevel === 0) {
            // Original strict criteria
            const commentToViewRatio = views > 0 ? comments / views : 0;
            passed = views > 10 && 
                    views < 10000 && 
                    comments < 50 && 
                    commentToViewRatio < 0.1 && 
                    title.length > 3 && 
                    this.seemsLikeQualityProject(title, description);
            reason = 'Strict criteria';
        } else if (filterLevel === 1) {
            // Moderate criteria
            passed = views > 5 && 
                    views < 50000 && 
                    comments < 100 && 
                    likes < 200 &&
                    title.length > 2 && 
                    this.seemsLikeQualityProject(title, description, true);
            reason = 'Moderate criteria';
        } else {
            // Loose criteria - just needs to not be obvious garbage
            passed = views > 0 && 
                    title.length > 2 && 
                    (this.seemsLikeQualityProject(title, description, true) || 
                     views > 50); // High views indicate some quality
            reason = 'Loose criteria';
        }
        
        if (this.testMode) {
            if (passed) {
                console.log(`✅ PASSED "${project.title}" (${reason}): Views: ${views}, Comments: ${comments}, Likes: ${likes}`);
            } else {
                console.log(`❌ Failed "${project.title}" (${reason}): Views: ${views}, Comments: ${comments}, Likes: ${likes}`);
            }
        }
        
        if (passed) {
            this.scanStats.totalFiltered++;
        }
        
        return passed;
    }

    async analyzeComments(comments) {
        const analysis = {
            hasGamblingContent: false,
            hasBeggingContent: false,
            commentCount: comments.length
        };
        
        const gamblingKeywords = [
            'gamble', 'gambling', 'bet', 'betting', 'casino', 'lottery',
            'jackpot', 'prize money', 'win money', 'tip to win', 'bet money',
            'pay to play', 'pay to win', '♦'
        ];
        
        const beggingKeywords = [
            'tip me please', 'send tips', 'give me credits', 'donate money',
            'pay me now', 'need tips', 'tip for more', 'credits please',
            'tipping', 'tip me', 'tip jar', 'donations welcome', 'accept tips',
            'pay to', 'pay for access', 'pay to see', 'pay to continue'
        ];
        
        for (const commentData of comments) {
            const comment = commentData.comment;
            if (!comment || !comment.raw_content) continue;
            
            const content = comment.raw_content.toLowerCase();
            
            // Check for gambling content
            if (gamblingKeywords.some(keyword => content.includes(keyword))) {
                analysis.hasGamblingContent = true;
            }
            
            // Check for begging content
            if (beggingKeywords.some(keyword => content.includes(keyword))) {
                analysis.hasBeggingContent = true;
            }
            
            // Early exit if we found problematic content
            if (analysis.hasGamblingContent && analysis.hasBeggingContent) {
                break;
            }
        }
        
        return analysis;
    }

    seemsLikeQualityProject(title, description, relaxed = false) {
        // Look for indicators of quality/effort
        const qualityKeywords = [
            'game', 'art', 'tool', 'portfolio', 'demo', 'experiment', 'creative',
            'interactive', 'animation', 'music', 'sound', 'design', 'code',
            'learn', 'tutorial', 'educational', 'simulation', 'visualization',
            'generator', 'calculator', 'dashboard', 'app', 'website', 'blog',
            'fun', 'cool', 'awesome', 'amazing', 'beautiful', 'simple', 'useful'
        ];
        
        const text = title + ' ' + description;
        
        const hasQualityKeyword = qualityKeywords.some(keyword => text.includes(keyword));
        const hasDecentTitle = title.length > (relaxed ? 5 : 10);
        
        if (relaxed) {
            // More lenient - just needs decent length or quality keyword
            return hasQualityKeyword || hasDecentTitle;
        } else {
            // Original criteria
            return hasQualityKeyword || hasDecentTitle;
        }
    }

    removeDuplicates(projects) {
        const seen = new Set();
        return projects.filter(projectData => {
            const id = projectData.project?.id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    // New: Check if we can add more projects to the current page
    canAddMoreToPage() {
        return this.filteredProjects.length < this.pageSize;
    }

    // New: Add project to display immediately
    addProjectToDisplay(projectData) {
        if (this.displayedProjectIds.has(projectData.project.id)) return;
        
        this.filteredProjects.push(projectData);
        this.displayedProjectIds.add(projectData.project.id);
        
        const grid = document.getElementById('project-grid');
        const card = this.createProjectCard(projectData);
        
        // Remove no-projects message if it exists
        const noProjectsMsg = grid.querySelector('.no-projects-message');
        if (noProjectsMsg) {
            noProjectsMsg.remove();
        }
        
        // Add with animation
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        grid.appendChild(card);
        
        // Animate in
        setTimeout(() => {
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100);
        
        // Update stats
        this.updateStats();
    }

    // New: Setup infinite scroll with improved detection
    setupInfiniteScroll() {
        let scrollTimeout;
        let lastScrollTop = 0;
        
        const handleScroll = () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const scrollTop = window.pageYOffset;
                const scrollPosition = window.innerHeight + scrollTop;
                const documentHeight = document.documentElement.offsetHeight;
                const scrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
                
                lastScrollTop = scrollTop;
                
                // If scrolled near bottom (within 800px) and scrolling down
                if (scrollPosition >= documentHeight - 800 && scrollDirection === 'down') {
                    this.resumeScanning();
                }
                
                // Also resume if user is actively scrolling and we don't have many projects queued
                if (scrollDirection === 'down' && this.projectQueue.length < 5) {
                    this.resumeScanning();
                }
            }, 100); // Faster response time
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        
        // Also check periodically if we need more projects
        setInterval(() => {
            if (!this.isScanning && this.projectQueue.length < 3) {
                console.log('🔄 Auto-resuming search - low project queue');
                this.resumeScanning();
            }
        }, 5000);
    }

    // New: Resume scanning with better queue management
    resumeScanning() {
        if (!this.isScanning && this.projectQueue.length < 10) { // Only resume if queue is low
            console.log('👀 Resuming search for more unique projects...');
            this.isScanning = true;
            this.pageSize += 12; // Increase page size
            
            // Show scanning indicator
            this.showScanningIndicator();
            
            // Resume search
            this.continuousSearch();
        }
    }

    // New: Pause scanning
    pauseScanning() {
        this.isScanning = false;
        this.hideScanningIndicator();
        console.log('⏸️ Page full - pausing search. Scroll down for more!');
    }

    // New: Show scanning indicator
    showScanningIndicator() {
        const grid = document.getElementById('project-grid');
        let indicator = document.getElementById('scanning-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'scanning-indicator';
            indicator.className = 'scanning-indicator';
            indicator.innerHTML = `
                <div class="spinner"></div>
                <p>🔍 Deep scanning for more deserving projects...</p>
            `;
            grid.appendChild(indicator);
        }
        
        indicator.style.display = 'block';
    }

    // New: Hide scanning indicator
    hideScanningIndicator() {
        const indicator = document.getElementById('scanning-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // New: Show loading screen
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const showcase = document.getElementById('project-showcase');
        
        loadingScreen.style.display = 'flex';
        showcase.style.display = 'none';
    }

    // New: Hide loading screen
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const showcase = document.getElementById('project-showcase');
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            showcase.style.display = 'block';
        }, 1000);
    }

    // New: Update stats display
    updateStats() {
        const stats = document.getElementById('filter-stats');
        const totalScanned = this.scanStats.totalScanned;
        
        if (this.testMode) {
            stats.textContent = `Found ${this.filteredProjects.length} deserving projects • Scanned ${totalScanned} • Filtered: G:${this.scanStats.gamblingFiltered} B:${this.scanStats.beggingFiltered} Q:${this.scanStats.qualityFiltered}`;
        } else {
            stats.textContent = `Found ${this.filteredProjects.length} deserving projects • Scanned ${totalScanned}+ projects`;
        }
    }

    // New: Utility sleep function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    renderProjects() {
        // This method is now mainly for the refresh button
        const grid = document.getElementById('project-grid');
        
        // Clear grid and reset
        grid.innerHTML = '';
        this.filteredProjects = [];
        this.displayedProjectIds.clear();
        this.projectQueue = [];
        this.searchOffset = 0;
        this.currentSearchStrategy = 0;
        // Don't clear searchedCombinations to avoid immediate duplicates
        this.pageSize = 12;
        
        // Restart scanning
        this.startContinuousSearch();
    }

    createProjectCard(projectData) {
        const { project, site } = projectData;
        const stats = project.stats || {};
        
        const card = document.createElement('div');
        card.className = 'project-card';
        
        // Generate thumbnail URL
        const thumbnailUrl = site ? `https://images.websim.com/v1/site/${site.id}/600` : '';
        
        card.innerHTML = `
            <img src="${thumbnailUrl}" alt="Project thumbnail" class="project-thumbnail" 
                 onerror="this.style.display='none'">
            <div class="project-title">${project.title || 'Untitled Project'}</div>
            <div class="project-creator">
                <img src="https://images.websim.com/avatar/${project.created_by?.username || 'anonymous'}" 
                     alt="Creator" class="creator-avatar" onerror="this.style.display='none'">
                <span>@${project.created_by?.username || 'anonymous'}</span>
            </div>
            <div class="project-stats">
                <span>👀 ${stats.views || 0} views</span>
                <span>💬 ${stats.comments || 0} comments</span>
                <span>❤️ ${stats.likes || 0} likes</span>
            </div>
            <div class="support-reason">
                ${this.getSupportReason(stats)}
            </div>
        `;
        
        card.addEventListener('click', () => {
            this.openProject(site, project);
        });
        
        return card;
    }

    getSupportReason(stats) {
        const views = stats.views || 0;
        const comments = stats.comments || 0;
        const likes = stats.likes || 0;
        
        if (views > 1000 && comments < 10) {
            return "🎯 High views, low engagement - needs appreciation!";
        } else if (likes < 10) {
            return "💎 Hidden gem - deserves more recognition!";
        } else if (comments === 0) {
            return "💬 No comments yet - be the first to show support!";
        } else {
            return "⭐ Quality project with room for more support!";
        }
    }

    openProject(site, project) {
        const iframe = document.getElementById('fullscreen-iframe');
        const frame = document.getElementById('project-frame');
        const title = document.querySelector('.iframe-title');
        
        if (site) {
            frame.src = `https://websim.com/c/${site.id}`;
            title.textContent = project.title || 'Untitled Project';
            iframe.style.display = 'block';
        }
    }

    setupEventListeners() {
        const backBtn = document.getElementById('back-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const iframe = document.getElementById('fullscreen-iframe');
        
        backBtn.addEventListener('click', () => {
            iframe.style.display = 'none';
            document.getElementById('project-frame').src = '';
        });
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.textContent = '🔄 Restarting Deep Scan...';
            refreshBtn.disabled = true;
            
            // Stop current scanning
            this.isScanning = false;
            
            await this.sleep(500); // Brief pause
            
            this.renderProjects();
            
            refreshBtn.textContent = '🔄 Restart Deep Scan';
            refreshBtn.disabled = false;
        });
        
        // Close iframe with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && iframe.style.display !== 'none') {
                iframe.style.display = 'none';
                document.getElementById('project-frame').src = '';
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResponsibleTippingFinder();
});