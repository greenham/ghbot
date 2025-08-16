const fs = require('fs');
const path = require('path');

class SFXManager {
  constructor() {
    this.sfxPath = path.join(__dirname, '..', '..', 'sfx');
    this.sfxList = [];
    this.cachedNames = [];
    this.searchCache = new Map(); // Cache for autocomplete searches
    
    // Load SFX list initially
    this.loadSFXList();
    
    // Watch for changes
    this.watchSFXDirectory();
  }

  /**
   * Load the list of available SFX files
   */
  loadSFXList() {
    try {
      if (!fs.existsSync(this.sfxPath)) {
        console.log('SFX directory not found, creating...');
        fs.mkdirSync(this.sfxPath, { recursive: true });
      }

      const files = fs.readdirSync(this.sfxPath);
      this.sfxList = files
        .filter(file => file.endsWith('.mp3') || file.endsWith('.wav'))
        .map(file => {
          const ext = path.extname(file);
          return {
            name: file.replace(ext, ''),
            filename: file,
            path: path.join(this.sfxPath, file)
          };
        });
      
      // Cache sorted names for autocomplete
      this.cachedNames = this.sfxList
        .map(sfx => sfx.name)
        .sort((a, b) => a.localeCompare(b));
      
      // Clear search cache when SFX list changes
      this.searchCache.clear();
      
      console.log(`Loaded ${this.sfxList.length} sound effects`);
    } catch (error) {
      console.error('Error loading SFX list:', error);
    }
  }

  /**
   * Watch the SFX directory for changes
   */
  watchSFXDirectory() {
    fs.watch(this.sfxPath, (eventType, filename) => {
      if (eventType === 'rename') {
        console.log('SFX directory changed, reloading...');
        this.loadSFXList();
      }
    });
  }

  /**
   * Get all available SFX
   * @returns {Array} List of SFX objects
   */
  getAllSFX() {
    return this.sfxList;
  }

  /**
   * Get SFX names for autocomplete (cached and sorted)
   * @returns {Array} List of SFX names
   */
  getSFXNames() {
    return this.cachedNames;
  }

  /**
   * Find an SFX by name
   * @param {string} name 
   * @returns {Object|undefined} SFX object or undefined
   */
  findSFX(name) {
    return this.sfxList.find(sfx => sfx.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Check if an SFX exists
   * @param {string} name 
   * @returns {boolean}
   */
  hasSFX(name) {
    return this.findSFX(name) !== undefined;
  }

  /**
   * Get the file path for an SFX
   * @param {string} name 
   * @returns {string|null}
   */
  getSFXPath(name) {
    const sfx = this.findSFX(name);
    return sfx ? sfx.path : null;
  }

  /**
   * Search SFX names (for autocomplete) with caching
   * @param {string} query 
   * @returns {Array} Matching SFX names
   */
  searchSFX(query) {
    const lowerQuery = query.toLowerCase();
    
    // Check cache first
    if (this.searchCache.has(lowerQuery)) {
      return this.searchCache.get(lowerQuery);
    }
    
    // Perform search on cached names (already sorted)
    const results = this.cachedNames
      .filter(name => name.toLowerCase().includes(lowerQuery))
      .slice(0, 25); // Discord autocomplete limit
    
    // Cache the result for future use
    this.searchCache.set(lowerQuery, results);
    
    return results;
  }
}

module.exports = new SFXManager();