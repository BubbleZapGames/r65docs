# R65 Examples - Build all .r65 examples to .smc ROMs
# Each .r65 source is compiled to assembly, assembled, and linked into a ROM.

# Tools
R65C = python -m r65.compiler.main
WLA = wla-65816
WLA_LINK = wlalink

# Flags
R65C_FLAGS = --cfg snes -I ~/R65/stdlib -I assets
WLA_FLAGS = -I assets -o 

# Build directory for intermediates
BUILD_DIR = build

# Find all .r65 source files
R65_SOURCES := $(shell find . -name '*.r65' -not -path './$(BUILD_DIR)/*')

# Derive .smc targets: ./basics/hello_registers.r65 -> ./basics/hello_registers.smc
SMC_TARGETS := $(R65_SOURCES:.r65=.smc)

# Default target
all: $(SMC_TARGETS)
	@echo "Built $(words $(SMC_TARGETS)) ROMs"

# Pattern rule: compile .r65 -> .asm -> .o -> .smc
# Intermediates go into BUILD_DIR mirroring the source tree
%.smc: %.r65
	@mkdir -p $(BUILD_DIR)/$(dir $<)
	@echo "[R65C] $<"
	@$(R65C) $< -o $(BUILD_DIR)/$(<:.r65=.asm) $(R65C_FLAGS)
	@echo "[WLA]  $(BUILD_DIR)/$(<:.r65=.asm)"
	$(WLA) $(WLA_FLAGS) $(BUILD_DIR)/$(<:.r65=.o) $(BUILD_DIR)/$(<:.r65=.asm)
	@echo "[LINK] $@"
	@printf '[objects]\n%s\n' "$(BUILD_DIR)/$(<:.r65=.o)" > $(BUILD_DIR)/$(<:.r65=.link)
	@$(WLA_LINK) -S $(BUILD_DIR)/$(<:.r65=.link) $@
#	@truncate -s 32768 $@

clean:
	@echo "[CLEAN] Removing build artifacts and ROMs..."
	rm -rf $(BUILD_DIR)
	find . -name '*.smc' -delete

list:
	@echo "Sources:"
	@$(foreach src,$(R65_SOURCES),echo "  $(src)";)
	@echo "Targets:"
	@$(foreach smc,$(SMC_TARGETS),echo "  $(smc)";)

.PHONY: all clean list
